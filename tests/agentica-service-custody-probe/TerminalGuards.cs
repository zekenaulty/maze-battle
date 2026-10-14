using Agentica.Lab.Web.Contracts;
using Agentica.Lab.Web.Runtime;

internal static class TerminalGuards
{
    public static void BeforeAcceptance(TerminalFixture fixture, HostOperationEvent terminal)
    {
        void Reject(string name, string code, HostOperationEvent item) =>
            fixture.Reject(name, code, () => fixture.Registry.ApplyOperationEvent(item));

        Reject("wrong original action", "operation.not_found", terminal with { ActionId = "different-original" });
        Reject("wrong original session", "operation.not_found", terminal with { SessionId = "different-session" });
        Reject("wrong original host", "operation.not_found", terminal with { HostId = "different-host" });
        Reject("wrong original operation", "operation.event_binding", terminal with { OperationId = "different-operation" });
        Reject("wrong active epoch", "operation.event_binding", terminal with { SessionEpoch = "different-epoch" });
        Reject("terminal cannot transfer epoch", "operation.epoch", terminal with { NextSessionEpoch = "different-epoch" });
        Reject("skipped sequence", "operation.sequence", terminal with { Sequence = 4 });
        Reject("reused progress sequence", "operation.sequence", terminal with { Sequence = 2 });
        Reject("changed progress event identity", "operation.event_changed", terminal with { EventId = fixture.Progress.EventId });
        Reject("scalar usage", "operation.usage", terminal with { Usage = HostProtocol.Element(1) });
        Reject("array usage", "operation.usage", terminal with { Usage = HostProtocol.Element(new[] { 1 }) });
        Reject("oversized usage", "operation.usage", terminal with
        {
            Usage = HostProtocol.Element(new { padding = new string('x', HostOperationStore.MaximumUsageBytes) })
        });
        Reject("stale observation", "operation.observation", terminal with { Observation = fixture.Admission.Observation! });
        Reject("changed observation identity", "operation.observation", terminal with
        {
            Observation = terminal.Observation with { Data = HostProtocol.Element(new { changed = true }) }
        });
        if (terminal.Kind == "completed")
        {
            Reject("missing completion", "operation.completion", terminal with { Completion = null });
            Reject("wrong objective", "operation.completion", terminal with { Completion = terminal.Completion! with { ObjectiveId = "different-objective" } });
            Reject("admission evidence is not completion", "operation.completion", terminal with
            {
                Completion = terminal.Completion! with { EvidenceId = fixture.Admission.EvidenceId }
            });
        }
        else
        {
            Reject("non-completed terminal cannot claim completion", "operation.completion", terminal with
            {
                Completion = new HostCompletion(fixture.Request.ObjectiveId, "not-completed", "Blocked or cancelled cannot complete the objective.")
            });
        }
    }

    public static void AfterAcceptance(TerminalFixture fixture, HostOperationEvent terminal, bool exhausted)
    {
        void Reject(string name, string code, HostOperationEvent item) =>
            fixture.Reject(name, code, () => fixture.Registry.ApplyOperationEvent(item));

        Reject("old custody probe", "operation.event_stale", fixture.Handshake);
        Reject("old progress", "operation.event_stale", fixture.Progress);
        Reject("changed terminal summary", "operation.event_changed", terminal with { Summary = "Changed terminal." });
        Reject("changed terminal usage", "operation.event_changed", terminal with { Usage = HostProtocol.Element(new { steps = 2 }) });
        Reject("changed terminal epoch", "operation.event_changed", terminal with { SessionEpoch = "different-epoch" });
        Reject("replacement terminal identity", "operation.not_parked", terminal with { EventId = "replacement-terminal" });
        Reject("progress after terminal", "operation.not_parked", terminal with
        {
            EventId = "post-terminal-progress", Sequence = 4, Kind = "progress", Completion = null
        });
        var decision = terminal with { EventId = "post-terminal-decision", Sequence = 4, Kind = "decision", Completion = null };
        Reject("decision needs wake transport", "operation.wake_transport", decision);
        fixture.Reject("terminal cannot wake", "operation.wake_kind", () => fixture.Registry.Wake(terminal));
        fixture.Reject("decision cannot restart terminal", exhausted ? "operation.budget" : "operation.not_parked",
            () => fixture.Registry.Wake(decision));
    }
}
