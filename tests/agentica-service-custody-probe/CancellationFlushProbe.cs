using System.Text.Json;
using Agentica.Lab.Web.Contracts;
using static ProbeSupport;

internal static class CancellationFlushProbe
{
    private sealed record RetainedDelivery(HostOperationEvent Pending, HostOperationEvent Terminal, string? OrdinaryAck = null);

    public static object Run(string root, bool progress, bool delivered)
    {
        using var fixture = new TerminalFixture(root, exhausted: true, deliveredSequence: progress ? 1 : 0);
        var pending = progress ? fixture.Progress : fixture.Handshake;
        var terminal = pending with
        {
            Kind = "cancelled", Sequence = pending.Sequence + 1, EventId = "cancel-after-" + pending.EventId,
            Summary = "Stop: flush only the exact retained event, then cancel; no further progress or completion.", Completion = null
        };
        // This fixture envelope is deliberately never ACKed. It is not a canonical Maze record or controller.
        var retainedPath = Path.Combine(root, "fixture-retained-delivery.json");
        File.WriteAllText(retainedPath, JsonSerializer.Serialize(new RetainedDelivery(pending, terminal), HostProtocol.Json));
        var retainedHash = Hash(retainedPath);
        var saved = JsonSerializer.Deserialize<RetainedDelivery>(File.ReadAllText(retainedPath), HostProtocol.Json)!;
        Require(saved.OrdinaryAck is null && ProtocolValidation.Digest(saved.Pending) == ProtocolValidation.Digest(pending) &&
            ProtocolValidation.Digest(saved.Terminal) == ProtocolValidation.Digest(terminal), "Retained flush input changed on roundtrip.");

        fixture.Reject("cancel cannot skip retained event", "operation.sequence", () => fixture.Registry.ApplyOperationEvent(saved.Terminal));
        if (delivered) fixture.Registry.ApplyOperationEvent(saved.Pending); // Drop the service return; persist no local ACK.
        fixture.Restart();
        Require((fixture.Inventory().LatestEvent?.Sequence ?? 0) == (delivered ? pending.Sequence : pending.Sequence - 1),
            "Fixture did not reproduce the selected delivery uncertainty.");

        var flushed = fixture.Registry.ApplyOperationEvent(saved.Pending);
        Require(flushed.State == "parked" && flushed.WakeRunId is null &&
            ProtocolValidation.Digest(flushed.LatestEvent!) == ProtocolValidation.Digest(saved.Pending), "Flush did not confirm the exact retained event.");
        fixture.Replay(saved.Pending, flushed);
        fixture.Reject("flush cannot replace retained payload", "operation.event_changed",
            () => fixture.Registry.ApplyOperationEvent(saved.Pending with { Summary = "Replacement is forbidden." }));
        Require(Hash(retainedPath) == retainedHash, "Flush required an ordinary local ACK write.");

        fixture.Registry.ApplyOperationEvent(saved.Terminal); // Drop terminal reply too; recovery must not replay the stale pending event.
        fixture.Restart();
        var latest = fixture.Inventory();
        Require(latest.State == "cancelled" && latest.WakeRunId is null && latest.LatestEvent!.Completion is null &&
            ProtocolValidation.Digest(latest.LatestEvent) == ProtocolValidation.Digest(saved.Terminal), "Lost terminal reply did not retain exact cancellation.");
        Require(ProtocolValidation.Digest(latest.LatestEvent!.Observation) == ProtocolValidation.Digest(saved.Pending.Observation) &&
            latest.LatestEvent.Usage is { } terminalUsage && saved.Pending.Usage is { } pendingUsage &&
            ProtocolValidation.Digest(terminalUsage) == ProtocolValidation.Digest(pendingUsage), "Cancellation invented movement or refreshed evidence.");
        fixture.Reject("terminal recovery must not reflush old event", "operation.event_stale",
            () => fixture.Registry.ApplyOperationEvent(saved.Pending));
        fixture.Replay(saved.Terminal, latest);
        fixture.Replay(saved.Terminal, latest);
        Require(Hash(retainedPath) == retainedHash, "Terminal recovery rewrote the unACKed fixture envelope.");
        return new
        {
            pendingKind = progress ? "progress" : "probe", deliveredBeforeStop = delivered,
            originalLocalAck = (string?)null, ordinaryLocalAckWrites = 0, pendingSequence = pending.Sequence,
            terminalSequence = terminal.Sequence, exactFlushAccepted = true, noFurtherProgressSubmitted = true,
            unchangedTerminalObservationAndUsage = true, exactLatestTerminalRetry = true, terminalReplyDropped = true,
            fixtureEnvelopeUnchanged = true, canonicalLocalStopAndAckNotExercised = true,
            pendingDigest = ProtocolValidation.Digest(saved.Pending), terminalDigest = ProtocolValidation.Digest(saved.Terminal),
            rejections = fixture.Rejections, activeRuns = 0, plannerCreateCalls = 0, providerDiscoveryCalls = 0, modelCalls = 0
        };
    }

    public static object Arrival(string root)
    {
        using var fixture = new TerminalFixture(root);
        var arrival = fixture.Terminal("decision") with { Summary = "Known destination reached; objective proof still outstanding." };
        Require(arrival.Completion is null, "Arrival fabricated objective proof.");
        fixture.Reject("arrival decision requires wake path", "operation.wake_transport", () => fixture.Registry.ApplyOperationEvent(arrival));
        fixture.Reject("arrival alone cannot complete objective", "operation.completion",
            () => fixture.Registry.ApplyOperationEvent(arrival with { Kind = "completed" }));
        Require(fixture.Inventory().State == "parked", "Unsubmitted arrival decision became terminal.");
        return new { arrivalKind = "decision", objectiveCompletionClaim = false, cognitionNotInvoked = true,
            successfulWakeNotExercised = true, rejections = fixture.Rejections, modelCalls = 0 };
    }
}
