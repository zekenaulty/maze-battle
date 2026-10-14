using System.Text.Json;
using Agentica.Lab.Web.Context;
using Agentica.Lab.Web.Contracts;
using Agentica.Lab.Web.Runtime;
using static ProbeSupport;

Require(args.Length == 1, "Pass one new isolated output directory.");
var output = Path.GetFullPath(args[0]);
Require(!Directory.Exists(output), "Probe output already exists; use a fresh directory, never a service ledger.");
var assemblies = VerifyAssemblies(Path.Combine(AppContext.BaseDirectory, "pin.json"));
Directory.CreateDirectory(output);
var cases = new[] { Run(Path.Combine(output, "pending"), false), Run(Path.Combine(output, "unresolved-result"), true) };
var mismatchedAdmission = RejectChangedAdmission(Path.Combine(output, "mismatched-admission"));
var evidence = new { status = "PASS", boundary = "real HostRunRegistry.ApplyOperationEvent / private CheckAdmission via public API",
    transport = "in-process registry; no HTTP, SDK connection, server, browser, planner or provider", assemblies, cases, mismatchedAdmission };
var proof = JsonSerializer.Serialize(evidence, new JsonSerializerOptions(HostProtocol.Json) { WriteIndented = true });
File.WriteAllText(Path.Combine(output, "proof.json"), proof);
Console.WriteLine(proof);

static object Run(string root, bool unresolvedResult)
{
    var request = ProbeInputs.Request(); var action = ProbeInputs.Action(request); var admission = ProbeInputs.Admission(action);
    var probe = ProbeInputs.Progress(request, admission); var digest = ProtocolValidation.Digest(probe);
    var contexts = new HostContextStore(Path.Combine(root, "contexts"));
    var custody = new ActionCustodyStore(Path.Combine(root, "custody"));
    var operations = new HostOperationStore(Path.Combine(root, "operations"));
    var planners = new ForbiddenPlannerFactory();
    using var registry = new HostRunRegistry(contexts, planners, custody, operations);
    var context = contexts.Open(request); context.RecordActionDispatch(action);
    operations.Reserve(request, action, new HostRunUsage());
    custody.Reserve(request.HostId, request.SessionId, request.SessionEpoch, action.RunId, action, request.Capabilities[0], request.ObjectiveId);
    if (unresolvedResult) custody.Resolve(request.HostId, request.SessionId, action.ActionId,
        new HostActionResult(action.ActionId, action.SessionId, action.SessionEpoch, "unresolved", 0, 0, "unknown-original", "Original outcome unresolved."));
    var parked = operations.Admit(request.HostId, request.SessionId, admission);
    context.RecordActionResult(action, admission);
    Require(parked.State == "parked" && parked.LatestEvent is null, "Expected parked admission without progress.");
    Require(custody.HasUnresolved(request.HostId, request.SessionId), "Admit must not settle original action custody.");
    var before = StoreSnapshot(root);
    string rejected;
    try { registry.ApplyOperationEvent(probe); throw new InvalidOperationException("Progress bypassed unresolved custody."); }
    catch (HostProtocolException error) { rejected = error.Code; Require(error.Code == "session.unresolved", "Wrong admission gate: " + error.Code); }
    Require(before == StoreSnapshot(root), "Rejected probe changed durable stores.");
    Require(operations.Get(request.HostId, request.SessionId, action.ActionId).LatestEvent is null, "Rejected probe advanced progress.");
    Require(ProtocolValidation.Digest(context.CurrentObservation) == ProtocolValidation.Digest(admission.Observation!), "Rejected probe changed observation.");

    Require(custody.Resolve(request.HostId, request.SessionId, action.ActionId, admission), "Original admission did not settle custody.");
    Require(!custody.Resolve(request.HostId, request.SessionId, action.ActionId, admission), "Exact result replay was not idempotent.");
    Require(!custody.HasUnresolved(request.HostId, request.SessionId), "Original custody remains unresolved.");
    var originalHash = custody.Get(request.HostId, request.SessionId, action.ActionId).ResultHash;
    Require(originalHash == ProtocolValidation.Digest(admission), "Custody does not bind the exact admission.");
    Require(digest == ProtocolValidation.Digest(probe), "Probe changed while resolving custody.");
    var accepted = registry.ApplyOperationEvent(probe);
    Require(accepted.LatestEvent?.Sequence == 1 && ProtocolValidation.Digest(accepted.LatestEvent) == digest, "Service did not accept exact probe.");
    Require(accepted.State == "parked" && accepted.ActiveEpoch == request.SessionEpoch && accepted.WakeRunId is null, "Probe changed execution custody.");
    var ledgerPath = Path.Combine(root, "operations", HostOperationStore.LedgerFileName); var ledgerHash = Hash(ledgerPath);
    var repeated = registry.ApplyOperationEvent(probe);
    Require(ProtocolValidation.Digest(repeated) == ProtocolValidation.Digest(accepted) && Hash(ledgerPath) == ledgerHash, "Event replay changed operation ledger.");
    Require(ProtocolValidation.Digest(context.CurrentObservation) == ProtocolValidation.Digest(admission.Observation!), "Zero-move probe refreshed observation.");
    Require(accepted.Usage == new HostRunUsage() && accepted.LatestEvent!.Usage!.Value.GetProperty("steps").GetInt32() == 0, "Probe claims movement or cognition.");
    Require(registry.List().Length == 0 && planners.CreateCalls == 0 && planners.MetadataCalls == 0, "Probe activated a run or provider.");
    return new { originalCustody = unresolvedResult ? "unresolved-result" : "pending-without-result", rejected,
        rejectedStoresUnchanged = true, exactOriginalResultResolved = true, identicalProbeAccepted = true, exactReplayAccepted = true,
        replayOperationLedgerUnchanged = true, movementSteps = 0, observationUnchanged = true, activeRuns = 0,
        plannerCreateCalls = planners.CreateCalls, providerDiscoveryCalls = planners.MetadataCalls, modelCalls = 0,
        originalResultHash = originalHash, eventDigest = digest, probe };
}

static object RejectChangedAdmission(string root)
{
    var request = ProbeInputs.Request(); var action = ProbeInputs.Action(request); var admission = ProbeInputs.Admission(action);
    var custody = new ActionCustodyStore(Path.Combine(root, "custody"));
    var operations = new HostOperationStore(Path.Combine(root, "operations"));
    var planners = new ForbiddenPlannerFactory();
    using var registry = new HostRunRegistry(new HostContextStore(Path.Combine(root, "contexts")), planners, custody, operations);
    operations.Reserve(request, action, new HostRunUsage());
    custody.Reserve(request.HostId, request.SessionId, request.SessionEpoch, action.RunId, action, request.Capabilities[0], request.ObjectiveId);
    operations.Admit(request.HostId, request.SessionId, admission);
    custody.Resolve(request.HostId, request.SessionId, action.ActionId, admission with { Summary = "Different retained result." });
    Require(!custody.HasUnresolved(request.HostId, request.SessionId), "Negative control still has unresolved custody.");
    var before = StoreSnapshot(root); string rejected;
    try { registry.ApplyOperationEvent(ProbeInputs.Progress(request, admission)); throw new InvalidOperationException("Changed admission hash bypassed custody."); }
    catch (HostProtocolException error) { rejected = error.Code; Require(error.Code == "operation.admission_unsettled", "Wrong original result gate: " + error.Code); }
    Require(before == StoreSnapshot(root), "Mismatched result probe changed stores.");
    Require(registry.List().Length == 0 && planners.CreateCalls == 0 && planners.MetadataCalls == 0, "Negative control activated a run or provider.");
    return new { rejected, rejectedStoresUnchanged = true, activeRuns = 0, plannerCreateCalls = 0, modelCalls = 0 };
}
