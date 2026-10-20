using System.Text.Json;
using Agentica.Lab.Web.Contracts;
using Agentica.Observations;
using Agentica.Planning;
using Agentica.Tools;

namespace Maze.StartServiceFixture;

// Two explicit windows; no seed, variant, hidden world address or target enters this policy.
internal sealed class DecisionHistoryPlanner(DecisionPlannerCounters counters) : IWorkflowPlanner
{
    private IWorkflowPlanner? _initial;
    private JsonElement _actor, _event;
    private string? _parentOperation, _observation;
    private int _stage;

    public Task<WorkflowPlan> CreatePlanAsync(PlanningRequest request, CancellationToken cancellationToken = default)
    {
        if (_initial is not null || _parentOperation is not null) throw new InvalidOperationException("No implicit history continuation.");
        var continuation = HostProtocol.Element(request.Request.Context
            ?? throw new InvalidOperationException("Missing actual host context.")).GetProperty("continuation");
        if (continuation.ValueKind == JsonValueKind.Null)
        {
            counters.Initial.Entered();
            _initial = new FrontierSequencePlanner(counters.Initial.Called, counters.Initial.Planned, room: true);
            return _initial.CreatePlanAsync(request, cancellationToken);
        }
        if (continuation.GetProperty("wake").GetProperty("kind").GetString() != "decision"
            || continuation.GetProperty("cumulativeUsage").GetProperty("continuations").GetInt32() != 1)
            throw new InvalidOperationException("Exactly one explicit decision continuation is required.");
        _parentOperation = continuation.GetProperty("admission").GetProperty("operation").GetProperty("operationId").GetString()
            ?? throw new InvalidOperationException("Missing original admitted operation.");
        counters.Successor.Entered(); counters.Successor.Called(false);
        return Next(request, cancellationToken);
    }

    public Task<WorkflowPlan> RefinePlanAsync(PlanningRequest request, Observation observation, CancellationToken cancellationToken = default)
    {
        if (_initial is not null) return _initial.RefinePlanAsync(request, observation, cancellationToken);
        if (_parentOperation is null || _stage is < 1 or > 2) throw new InvalidOperationException("History window exhausted.");
        counters.Successor.Called(true);
        return Next(request, cancellationToken);
    }

    private Task<WorkflowPlan> Next(PlanningRequest request, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var frame = request.ContextFrames.Single(f => f.Kind == "agentica.host_context");
        var current = HostProtocol.Element(frame.Payload).GetProperty("currentObservation");
        var id = current.GetProperty("Reference").GetProperty("ObservationId").GetString();
        if (string.IsNullOrEmpty(id) || id == _observation) throw new InvalidOperationException("Distinct delivered observation required.");
        _observation = id;
        var data = current.GetProperty("Data");
        if (_stage == 0)
        {
            if (data.GetProperty("scope").GetString() != "actor" || data.TryGetProperty("navigation", out _))
                throw new InvalidOperationException("Expected the unchanged renewed actor-only observation.");
            _actor = data.GetProperty("actor").Clone();
        }
        else
        {
            if (data.GetProperty("scope").GetString() != "decision" || data.GetProperty("state").GetString() != "historical")
                throw new InvalidOperationException("Explicit historical decision evidence required.");
            var terminal = data.GetProperty("event");
            if (terminal.GetProperty("kind").GetString() != "decision"
                || terminal.GetProperty("operationId").GetString() != _parentOperation
                || terminal.GetProperty("observation").GetProperty("data").GetProperty("navigation")
                    .GetProperty("notice").GetProperty("source").ValueKind != JsonValueKind.Object)
                throw new InvalidOperationException("Missing original material notice/source.");
            if (_stage == 1) _event = terminal.Clone();
            else if (_event.GetRawText() != terminal.GetRawText())
                throw new InvalidOperationException("Repeated historical query changed the original event.");
        }
        var navigate = _stage == 2;
        var input = new Dictionary<string, object?>();
        if (navigate)
            foreach (var key in new[] { "level", "spaceId", "row", "column" }) input[key] = _actor.GetProperty(key).Clone();
        else input["scope"] = "decision";
        _stage++; counters.Successor.Planned();
        return Task.FromResult(new WorkflowPlan("history-" + _stage, _stage,
            [new PlanStep("history-step-" + _stage, navigate ? "maze.navigate" : "maze.inspect",
                navigate ? ToolKind.Action : ToolKind.Query, navigate ? ToolEffect.WritesLocalState : ToolEffect.ReadOnly, input)],
            "Read the same historical notice twice, then navigate to the observed actor address for zero-step custody only."));
    }
}
