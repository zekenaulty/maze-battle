using Agentica.Lab.Web.Contracts;
using static ProbeSupport;

internal static class TerminalProbe
{
    public static object Run(string root, string kind, bool exhausted)
    {
        using var fixture = new TerminalFixture(root, exhausted);
        var terminal = fixture.Terminal(kind);
        TerminalGuards.BeforeAcceptance(fixture, terminal);
        // Drop the returned entry, then rebuild all registry/store instances as after a lost reply and process restart.
        fixture.Registry.ApplyOperationEvent(terminal);
        fixture.Restart();
        var retained = fixture.Inventory();
        Require(retained.State == kind && retained.ActiveEpoch == fixture.Request.SessionEpoch && retained.WakeRunId is null,
            "Restart did not retain terminal state without a wake.");
        Require(ProtocolValidation.Digest(retained.LatestEvent!) == ProtocolValidation.Digest(terminal), "Lost-ACK inventory is not the exact terminal.");
        Require(ProtocolValidation.Digest(retained.Action) == ProtocolValidation.Digest(fixture.Action) &&
            ProtocolValidation.Digest(retained.Admission!) == ProtocolValidation.Digest(fixture.Admission), "Terminal replaced original admission lineage.");
        Require(retained.Usage == fixture.ServiceUsage && retained.LatestEvent!.Usage!.Value.GetProperty("steps").GetInt32() == 1,
            "Terminal confused service cognitive usage with host movement usage.");
        fixture.Replay(terminal, retained);
        TerminalGuards.AfterAcceptance(fixture, terminal, exhausted);

        // A later unrelated unresolved action blocks terminal retries, not read-only original-event reconciliation.
        var other = fixture.Action with { ActionId = "later-unresolved-action", StepId = "later-step", ExpectedRevision = 2 };
        fixture.Custody.Reserve(fixture.Request.HostId, fixture.Request.SessionId, fixture.Request.SessionEpoch, other.RunId,
            other, fixture.Request.Capabilities[0], fixture.Request.ObjectiveId);
        fixture.Reject("lost ACK with later unresolved custody", "session.unresolved", () => fixture.Registry.ApplyOperationEvent(terminal));
        Require(ProtocolValidation.Digest(fixture.Inventory()) == ProtocolValidation.Digest(retained), "Unresolved custody obscured retained terminal inventory.");
        var otherResult = new HostActionResult(other.ActionId, other.SessionId, other.SessionEpoch, "refused", 2, 2,
            "later-refusal-evidence", "No later host effect occurred.", fixture.Progress.Observation);
        fixture.Custody.Resolve(fixture.Request.HostId, fixture.Request.SessionId, other.ActionId, otherResult);
        fixture.Replay(terminal, retained);
        return new
        {
            kind, exhaustedServiceBudget = exhausted, handshakeSequence = 1, progressSequence = 2, reportedHostSteps = 1,
            terminalSequence = 3, exactProgressReplay = true, terminalReplyDropped = true, storesReopened = true,
            inventoryExactOriginalTerminal = true, exactTerminalReplay = true, replayOperationLedgerUnchanged = true,
            unresolvedBlocksRetryNotInventory = true, serviceUsage = retained.Usage, terminalDigest = ProtocolValidation.Digest(terminal),
            terminal, rejections = fixture.Rejections, activeRuns = 0, plannerCreateCalls = 0, providerDiscoveryCalls = 0, modelCalls = 0
        };
    }

    public static object UsageBoundary(string root)
    {
        using var fixture = new TerminalFixture(root);
        var terminal = fixture.Terminal("cancelled") with { Usage = HostProtocol.Element(new { steps = -7 }) };
        var accepted = fixture.Registry.ApplyOperationEvent(terminal);
        Require(accepted.LatestEvent!.Usage!.Value.GetProperty("steps").GetInt32() == -7 && accepted.Usage == fixture.ServiceUsage,
            "Pinned usage boundary changed; reassess the host-owned validation contract.");
        fixture.Replay(terminal, accepted);
        return new { acceptedNegativeHostSteps = -7, serviceUsageUnchanged = true, hostMustValidateSemanticUsage = true,
            boundary = "Characterization, not valid Maze evidence: service checks bounded object shape, not host counters.", modelCalls = 0 };
    }

    public static object ActiveEpoch(string root)
    {
        using var fixture = new TerminalFixture(root);
        var transfer = fixture.Terminal("cancelled") with
        {
            Kind = "transfer", EventId = "transfer-epoch-seq3", NextSessionEpoch = "2", Completion = null
        };
        var transferred = fixture.Registry.ApplyOperationEvent(transfer);
        Require(transferred.ActiveEpoch == "2" && transferred.State == "parked", "Transfer did not change the active epoch.");
        fixture.Replay(transfer, transferred);
        var cancelled = fixture.Terminal("cancelled") with { Sequence = 4, EventId = "transferred-cancel-seq4" };
        fixture.Reject("original epoch retired", "operation.event_binding", () => fixture.Registry.ApplyOperationEvent(cancelled));
        cancelled = cancelled with { SessionEpoch = "2" };
        var accepted = fixture.Registry.ApplyOperationEvent(cancelled);
        Require(accepted.State == "cancelled" && accepted.Action.SessionEpoch == "1" && accepted.ActiveEpoch == "2",
            "Transferred cancellation rewrote original identity or lost current ownership.");
        fixture.Replay(cancelled, accepted);
        fixture.Reject("old transfer after terminal", "operation.event_stale", () => fixture.Registry.ApplyOperationEvent(transfer));
        return new { originalEpoch = "1", activeEpoch = "2", transferReplayAccepted = true, activeEpochCancelAccepted = true,
            exactTerminalReplay = true, rejections = fixture.Rejections, activeRuns = 0, modelCalls = 0 };
    }
}
