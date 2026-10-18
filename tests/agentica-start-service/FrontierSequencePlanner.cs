using System.Text.Json;
using Agentica.Lab.Web.Contracts;
using Agentica.Observations;
using Agentica.Planning;
using Agentica.Tools;

namespace Maze.StartServiceFixture;

// Two choices per window: ask for earned boundaries, then select one returned token unchanged.
internal sealed class FrontierSequencePlanner(Action<bool> called, Action planned) : IWorkflowPlanner
{
    private int _stage;
    private string? _observation;

    public Task<WorkflowPlan> CreatePlanAsync(PlanningRequest request, CancellationToken cancellationToken = default)
    {
        called(false);
        if (_stage != 0) throw new InvalidOperationException("No implicit frontier continuation is permitted.");
        return Next(request, cancellationToken);
    }

    public Task<WorkflowPlan> RefinePlanAsync(PlanningRequest request, Observation observation, CancellationToken cancellationToken = default)
    {
        called(true);
        if (_stage != 1) throw new InvalidOperationException("Only one frontier-query refinement is permitted.");
        return Next(request, cancellationToken);
    }

    private Task<WorkflowPlan> Next(PlanningRequest request, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var frame = request.ContextFrames.Single(frame => frame.Kind == "agentica.host_context");
        var current = HostProtocol.Element(frame.Payload).GetProperty("currentObservation");
        var id = current.GetProperty("Reference").GetProperty("ObservationId").GetString();
        var data = current.GetProperty("Data");
        if (string.IsNullOrEmpty(id) || id == _observation
            || data.GetProperty("scope").GetString() != (_stage == 0 ? "actor" : "frontiers"))
            throw new InvalidOperationException("Frontier selection requires distinct real earned observations.");
        _observation = id;
        var input = new Dictionary<string, object?>();
        var explore = _stage == 1;
        if (explore)
        {
            var entries = data.GetProperty("frontiers").EnumerateArray().ToArray();
            if (entries.Length == 0) throw new InvalidOperationException("No frontier in this public query page.");
            var token = entries[0].GetProperty("frontier");
            if (token.ValueKind != JsonValueKind.String || string.IsNullOrEmpty(token.GetString()))
                throw new InvalidOperationException("Missing public frontier selection token.");
            input["frontier"] = token.Clone();
        }
        else
        {
            if (data.GetProperty("actor").GetProperty("mode").GetString() == "town"
                || data.GetProperty("source").ValueKind != JsonValueKind.Object)
                throw new InvalidOperationException("Frontier exploration requires an earned dungeon actor.");
            input["scope"] = "frontiers";
        }
        _stage++; planned();
        return Task.FromResult(new WorkflowPlan("frontier-script-" + _stage, _stage,
            [new PlanStep("frontier-step-" + _stage, explore ? "maze.explore" : "maze.inspect",
                explore ? ToolKind.Action : ToolKind.Query, explore ? ToolEffect.WritesLocalState : ToolEffect.ReadOnly, input)],
            "Approach one selected earned boundary; do not collect, continue automatically or claim completion."));
    }
}
