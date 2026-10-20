using System.Net;
using Agentica.Lab.Web;
using Agentica.Lab.Web.Providers;
using Agentica.Lab.Web.Runtime;
using Maze.StartServiceFixture;

if (args.Length is < 1 or > 2 || !Path.IsPathFullyQualified(args[0]))
    throw new ArgumentException("Supply an absolute isolated storage directory and optional loopback port.");
var port = 5259;
if (args.Length == 2 && (!int.TryParse(args[1], out port) || port is < 1024 or > 65535))
    throw new ArgumentException("Invalid isolated loopback port.");
var storage = Path.GetFullPath(args[0]);
if (!storage.StartsWith(Path.GetTempPath(), StringComparison.OrdinalIgnoreCase))
    throw new ArgumentException("Fixture storage must be below TEMP.");
Directory.CreateDirectory(storage);
Directory.CreateDirectory(Path.Combine(storage, "wwwroot"));
var factory = new WaitingPlannerFactory();
await using var app = LabWebApplication.Create(
    ["--urls", $"http://127.0.0.1:{port}", "--contentRoot", storage, "--environment", "Production"],
    factory, storage, new OpenAiProviderConfiguration(_ => throw new InvalidOperationException("Provider environment access forbidden.")));
app.Use(async (context, next) =>
{
    if (context.Connection.RemoteIpAddress is not { } address || !IPAddress.IsLoopback(address))
    {
        context.Response.StatusCode = 403;
        return;
    }
    var route = context.Request.Method + " " + context.Request.Path.Value;
    if (route is not ("GET /api/health" or "GET /api/host" or "GET /api/starts" or "POST /api/starts/stop" or "GET /fixture/proof"
        or "GET /api/operations" or "POST /api/operations/events" or "POST /api/operations/stop-decision" or "GET /api/recovery"
        or "GET /api/recovery/action" or "GET /api/recovery/run" or "POST /api/recovery" or "GET /fixture/run"))
    {
        context.Response.StatusCode = 403;
        return;
    }
    await next(context);
});
app.MapGet("/fixture/run", (string runId, HostRunRegistry registry) =>
{
    var run = registry.Get(runId);
    return new { run.RunId, run.Request.HostId, run.Request.SessionId, run.Request.SessionEpoch,
        terminal = run.Terminal, completionCompleted = run.Completion.IsCompleted, unresolved = run.HasUnresolvedActions };
});
app.MapGet("/fixture/proof", () => new
{
    source = "27cb2ce9717438edfe19487e3920faa183112c97",
    processId = Environment.ProcessId,
    factory.Created, factory.Entered, factory.Cancelled,
    factory.ScriptedCreated, factory.ScriptedCreateCalls, factory.ScriptedRefineCalls, factory.ScriptedStepsPlanned,
    decision = factory.Decision.Snapshot(),
    paidProviderCalls = 0, paidProviderCallsEvidence = "by-construction: injected offline planners only; not billing telemetry"
});
await app.RunAsync();
