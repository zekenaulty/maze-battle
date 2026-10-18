using System.Text.Json;
using Agentica.Lab.Web.Contracts;
using Agentica.Observations;
using Agentica.Planning;
using Agentica.Tools;

namespace Maze.StartServiceFixture;

// Inspect the actual actor tile, then copy one disclosed target unchanged. No fixture state enters the planner.
internal sealed class NewChestSequencePlanner(DecisionPlannerCounters counters) : IWorkflowPlanner
{
    private int _stage;
    private string? _observation;
    private JsonElement _actor;
    private bool? _successor;
    private PlannerWindowCounters? _window;

    public Task<WorkflowPlan> CreatePlanAsync(PlanningRequest request, CancellationToken cancellationToken = default)
    {
        if (_stage != 0 || _successor is not null) throw new InvalidOperationException("No implicit chest continuation is permitted.");
        _successor = IsSuccessor(request);
        _window = _successor.Value ? counters.Successor : counters.Initial;
        _window.Entered(); _window.Called(false);
        return Next(request, cancellationToken);
    }

    public Task<WorkflowPlan> RefinePlanAsync(PlanningRequest request, Observation observation, CancellationToken cancellationToken = default)
    {
        if (_stage != 1 || _successor != IsSuccessor(request)) throw new InvalidOperationException("Only the original query refinement is permitted.");
        _window!.Called(true);
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
            || data.GetProperty("scope").GetString() != (_stage == 0 || _successor == true ? "actor" : "cell"))
            throw new InvalidOperationException("Chest selection requires distinct real earned observations.");
        _observation = id;
        var action = _stage == 1;
        var input = new Dictionary<string, object?>();
        if (!action)
        {
            _actor = data.GetProperty("actor").Clone();
            if (_actor.GetProperty("mode").GetString() == "town"
                || data.GetProperty("source").ValueKind != JsonValueKind.Object)
                throw new InvalidOperationException("Chest inspection requires an earned dungeon actor.");
            if (_successor != true)
            {
                input["scope"] = "cell";
                foreach (var field in new[] { "level", "spaceId", "row", "column" })
                    input[field] = _actor.GetProperty(field).Clone();
            }
        }
        else if (_successor == true)
        {
            var actor = data.GetProperty("actor");
            if (actor.GetProperty("mode").GetString() == "town"
                || data.GetProperty("source").ValueKind != JsonValueKind.Object)
                throw new InvalidOperationException("The zero-step custody target requires a fresh earned actor.");
            foreach (var field in new[] { "level", "spaceId", "row", "column" })
            {
                if (actor.GetProperty(field).GetRawText() != _actor.GetProperty(field).GetRawText())
                    throw new InvalidOperationException("The custody-only successor must not move the actor.");
                input[field] = actor.GetProperty(field).Clone();
            }
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
        _stage++; _window!.Planned();
        var capability = _successor == true ? action ? "maze.navigate" : "maze.observe" : action ? "maze.interact" : "maze.inspect";
        return Task.FromResult(new WorkflowPlan("chest-script-" + _stage, _stage,
            [new PlanStep("chest-step-" + _stage, capability,
                action ? ToolKind.Action : ToolKind.Query, action ? ToolEffect.WritesLocalState : ToolEffect.ReadOnly, input)],
            _successor == true ? "Zero-step custody test only: observe, then navigate to that returned actor tile. This is not quest-return or reward-claim proof."
                : "Inspect the current tile, then explicitly open its disclosed chest once. Do not move, claim rewards or continue automatically."));
    }

    private static bool IsSuccessor(PlanningRequest request)
    {
        var continuation = HostProtocol.Element(request.Request.Context
            ?? throw new InvalidOperationException("Missing real chest request context.")).GetProperty("continuation");
        if (continuation.ValueKind == JsonValueKind.Null) return false;
        var wake = continuation.GetProperty("wake");
        var operation = continuation.GetProperty("admission").GetProperty("operation").GetProperty("operationId").GetString();
        if (wake.GetProperty("kind").GetString() != "decision" || operation?.StartsWith("interact-", StringComparison.Ordinal) != true
            || wake.GetProperty("operationId").GetString() != operation
            || string.IsNullOrEmpty(continuation.GetProperty("parentRunId").GetString())
            || continuation.GetProperty("cumulativeUsage").GetProperty("continuations").GetInt32() != 1)
            throw new InvalidOperationException("Only one explicit successor of the actual chest decision is permitted.");
        return true;
    }
}
