using Agentica.Lab.Web.Contracts;
using Agentica.Lab.Web.Providers;
using Agentica.Tools;

internal static class ProbeInputs
{
    private static readonly DateTimeOffset ObservedAt = new(2026, 10, 13, 0, 0, 0, TimeSpan.Zero);
    public static HostObservation Observation(string id, long revision) => new(id, revision, ObservedAt,
        HostProtocol.Element(new { actor = new { level = 1, spaceId = "fixture-room", row = 0, column = 0 }, steps = 0 }));

    public static HostRunRequest Request() => new(1, "maze-battle", "custody-probe-session", "1", "custody-probe-scope", "party",
        "custody-probe-objective", "Provider-free original-admission custody probe; perform no movement.", Observation("initial", 0),
        [new HostCapability("maze.navigate", "Navigate", "Retain a fixture admission without executing movement.",
            ToolKind.Action, ToolEffect.WritesLocalState, ToolInputSchema.Create(), DurableHandoff: true)],
        new ProviderSettings("fixture", "never-created"),
        new HostRunLimits(MaxSteps: 1, MaxRefinements: 0, MaxPlanContinuations: 0));

    public static HostActionRequest Action(HostRunRequest request) => new("original-action", "fixture-run", "fixture-runner", "fixture-step",
        request.SessionId, request.SessionEpoch, request.Capabilities[0].Id, ProtocolValidation.Digest(request.Capabilities),
        HostProtocol.Element(new { }), request.Observation.Revision, new DateTimeOffset(2099, 1, 1, 0, 0, 0, TimeSpan.Zero));

    public static HostActionResult Admission(HostActionRequest action) => new(action.ActionId, action.SessionId, action.SessionEpoch,
        "applied", action.ExpectedRevision, action.ExpectedRevision + 1, "original-admission-evidence", "Admitted without movement or completion.",
        Observation("original-admission-observation", action.ExpectedRevision + 1),
        Operation: new HostOperationAdmission("original-operation", "Awaiting original custody confirmation.", HostProtocol.Element(new { steps = 0 })));

    public static HostOperationEvent Progress(HostRunRequest request, HostActionResult admission) => new(request.HostId, request.SessionId,
        request.SessionEpoch, admission.ActionId, admission.Operation!.OperationId, 1, "custody-probe-original-operation-seq1", "progress",
        admission.Observation!, "Zero-move custody confirmation probe; no new observation or effect.", HostProtocol.Element(new { steps = 0 }));
}
