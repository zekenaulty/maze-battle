using System.Text.Json;
using Agentica.Lab.Web.Contracts;
using Agentica.Lab.Web.Runtime;
using static ProbeSupport;

internal static class StopDecisionProbe
{
    public static object Run(string root, bool exhausted)
    {
        using var fixture = new TerminalFixture(root, exhausted);
        var decision = fixture.Terminal("decision") with
        {
            Summary = "Known destination reached; objective proof remains outstanding. Explicit Stop suppresses this decision."
        };
        Require(decision.Completion is null, "Arrival fabricated objective completion.");
        var retainedPath = Path.Combine(root, "fixture-retained-stop-decision.json");
        File.WriteAllText(retainedPath, JsonSerializer.Serialize(decision, HostProtocol.Json));
        var retainedHash = Hash(retainedPath);
        var original = JsonSerializer.Deserialize<HostOperationEvent>(File.ReadAllText(retainedPath), HostProtocol.Json)!;
        Require(ProtocolValidation.Digest(original) == ProtocolValidation.Digest(decision), "Retained decision changed on roundtrip.");

        fixture.Reject("stop cannot skip next sequence", "operation.sequence",
            () => fixture.Registry.StopDecision(original with { Sequence = 4 }));
        fixture.Reject("ordinary cancellation is not StopDecision", "operation.stop_kind",
            () => fixture.Registry.StopDecision(original with { Kind = "cancelled" }));
        fixture.Reject("stopped arrival cannot claim completion", "operation.completion",
            () => fixture.Registry.StopDecision(original with
            {
                Completion = new HostCompletion(fixture.Request.ObjectiveId, "unearned-completion", "Arrival is not objective proof.")
            }));

        // Commit suppression but discard the return value, as when the stop reply never reaches the host.
        fixture.Registry.StopDecision(original);
        fixture.Restart();
        var retained = fixture.Inventory();
        Require(retained.State == "cancelled" && retained.LatestEvent?.Kind == "decision" && retained.LatestEvent.Completion is null,
            "Suppression must cancel the operation without relabeling the decision or completing its objective.");
        Require(retained.LatestEvent is not null && retained.StopDecision is not null &&
            ProtocolValidation.Digest(retained.LatestEvent) == ProtocolValidation.Digest(original) &&
            ProtocolValidation.Digest(retained.StopDecision) == ProtocolValidation.Digest(original), "Inventory lost the exact stopped decision.");
        Require(retained.WakeRunId is null && retained.WakeAdoption is null && retained.SettledUsage is null &&
            retained.ActiveEpoch == fixture.Request.SessionEpoch && retained.Usage == fixture.ServiceUsage,
            "StopDecision claimed successor custody or changed cumulative service usage.");
        Require(ProtocolValidation.Digest(retained.Request) == ProtocolValidation.Digest(fixture.Request) &&
            ProtocolValidation.Digest(retained.Action) == ProtocolValidation.Digest(fixture.Action) &&
            ProtocolValidation.Digest(retained.Admission!) == ProtocolValidation.Digest(fixture.Admission), "StopDecision changed original admission lineage.");
        Replay(fixture, original, retained);
        fixture.Restart();
        Replay(fixture, original, retained);

        fixture.Reject("changed stopped decision payload", "operation.stop_changed",
            () => fixture.Registry.StopDecision(original with { Summary = "Changed original decision." }));
        fixture.Reject("replacement stopped decision identity", "operation.stop_changed",
            () => fixture.Registry.StopDecision(original with { EventId = "replacement-decision" }));
        fixture.Reject("changed stopped decision epoch", "operation.stop_changed",
            () => fixture.Registry.StopDecision(original with { SessionEpoch = "different-epoch" }));
        fixture.Reject("ordinary event API cannot replay decision", "operation.wake_transport",
            () => fixture.Registry.ApplyOperationEvent(original));
        fixture.Reject("stopped identity cannot become cancelled event", "operation.stopped",
            () => fixture.Registry.ApplyOperationEvent(original with { Kind = "cancelled" }));
        Replay(fixture, original, retained);
        Require(Hash(retainedPath) == retainedHash, "Lost-reply reconciliation rewrote its original decision.");
        return new
        {
            exhaustedServiceBudget = exhausted, originalDecision = original, decisionDigest = ProtocolValidation.Digest(original),
            stopReplyDropped = true, storesReopenedTwice = true, state = retained.State,
            exactLatestEventAndStopDecision = true, exactOriginalLineage = true, exactReplayAccepted = true,
            replayAllStoreBytesUnchanged = true, fixtureDecisionUnchanged = true, objectiveCompletionClaim = false,
            serviceUsage = retained.Usage, rejections = fixture.Rejections, activeRuns = 0, wakeCalls = 0,
            plannerCreateCalls = 0, providerDiscoveryCalls = 0, modelCalls = 0
        };
    }

    private static void Replay(TerminalFixture fixture, HostOperationEvent decision, HostOperationEntry expected)
    {
        var before = StoreSnapshot(fixture.Root);
        var accepted = fixture.Registry.StopDecision(decision);
        Require(ProtocolValidation.Digest(accepted) == ProtocolValidation.Digest(expected), "StopDecision replay changed the original response.");
        Require(StoreSnapshot(fixture.Root) == before, "StopDecision replay changed durable stores.");
        fixture.AssertNoExecution();
    }
}
