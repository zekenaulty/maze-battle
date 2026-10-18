using System.Text.Json;
using Agentica.Lab.Web.Contracts;
using Agentica.Observations;
using Agentica.Planning;
using Agentica.Tools;

namespace Maze.StartServiceFixture;

// Inspect the actual actor tile, then copy one disclosed target unchanged. No fixture state enters the planner.
internal sealed class NewChestSequencePlanner(Action<bool> called, Action planned) : IWorkflowPlanner
{
    private int _stage;
    private string? _observation;
    private JsonElement _actor;

    public Task<WorkflowPlan> CreatePlanAsync(PlanningRequest request, CancellationToken cancellationToken = default)
    {
        called(false);
        if (_stage != 0 || HostProtocol.Element(request.Request.Context
                ?? throw new InvalidOperationException("Missing real chest request context."))
                .GetProperty("continuation").ValueKind != JsonValueKind.Null)
            throw new InvalidOperationException("The chest fixture permits only one explicit initial window.");
        return Next(request, cancellationToken);
    }

    public Task<WorkflowPlan> RefinePlanAsync(PlanningRequest request, Observation observation, CancellationToken cancellationToken = default)
    {
        called(true);
        if (_stage != 1) throw new InvalidOperationException("Only the cell-query refinement is permitted.");
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
            || data.GetProperty("scope").GetString() != (_stage == 0 ? "actor" : "cell"))
            throw new InvalidOperationException("Chest selection requires distinct real earned observations.");
        _observation = id;
        var interact = _stage == 1;
        var input = new Dictionary<string, object?>();
        if (!interact)
        {
            _actor = data.GetProperty("actor").Clone();
            if (_actor.GetProperty("mode").GetString() == "town"
                || data.GetProperty("source").ValueKind != JsonValueKind.Object)
                throw new InvalidOperationException("Chest inspection requires an earned dungeon actor.");
            input["scope"] = "cell";
            foreach (var field in new[] { "level", "spaceId", "row", "column" })
                input[field] = _actor.GetProperty(field).Clone();
        }
        else
        {
            var cell = data.GetProperty("cell");
            if (cell.GetProperty("state").GetString() != "visible"
                || new[] { "level", "spaceId", "row", "column" }.Any(field =>
                    cell.GetProperty("at").GetProperty(field).GetRawText() != _actor.GetProperty(field).GetRawText()))
                throw new InvalidOperationException("The inspected chest must be on the original current tile.");
            var choices = cell.GetProperty("chests").EnumerateArray().Where(chest =>
                !chest.GetProperty("opened").GetBoolean() && chest.TryGetProperty("target", out var target)
                && target.ValueKind == JsonValueKind.String && !string.IsNullOrEmpty(target.GetString())).ToArray();
            if (choices.Length != 1) throw new InvalidOperationException("Expected one explicitly disclosed current-tile chest target.");
            input["target"] = choices[0].GetProperty("target").Clone();
        }
        _stage++; planned();
        return Task.FromResult(new WorkflowPlan("chest-script-" + _stage, _stage,
            [new PlanStep("chest-step-" + _stage, interact ? "maze.interact" : "maze.inspect",
                interact ? ToolKind.Action : ToolKind.Query, interact ? ToolEffect.WritesLocalState : ToolEffect.ReadOnly, input)],
            "Inspect the current tile, then explicitly open its disclosed chest once. Do not move, claim rewards or continue automatically."));
    }
}
