using System.Text.Json;
using Agentica.Lab.Web.Contracts;
using Agentica.Observations;
using Agentica.Planning;
using Agentica.Tools;

namespace Maze.StartServiceFixture;

// Deterministic qualification policy, not a model competence claim. Only delivered public data is consulted.
internal sealed class CorpusSequencePlanner(DecisionPlannerCounters counters) : IWorkflowPlanner
{
    private PlannerWindowCounters? _counts;
    private JsonElement _actor;
    private string? _observation;
    private int _steps;

    public Task<WorkflowPlan> CreatePlanAsync(PlanningRequest request, CancellationToken cancellationToken = default)
    {
        if (_counts is not null) throw new InvalidOperationException("No implicit corpus continuation.");
        var continuation = HostProtocol.Element(request.Request.Context
            ?? throw new InvalidOperationException("Missing real request context.")).GetProperty("continuation");
        _counts = continuation.ValueKind == JsonValueKind.Null ? counters.Initial : counters.Successor;
        if (continuation.ValueKind != JsonValueKind.Null && continuation.GetProperty("wake").GetProperty("kind").GetString() != "decision")
            throw new InvalidOperationException("Corpus continuation requires an explicit retained decision.");
        _counts.Entered(); _counts.Called(false);
        return Next(request, cancellationToken);
    }

    public Task<WorkflowPlan> RefinePlanAsync(PlanningRequest request, Observation observation, CancellationToken cancellationToken = default)
    {
        if (_counts is null || _steps >= 16) throw new InvalidOperationException("Corpus query window exhausted.");
        _counts.Called(true);
        return Next(request, cancellationToken);
    }

    private Task<WorkflowPlan> Next(PlanningRequest request, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var frame = request.ContextFrames.Single(f => f.Kind == "agentica.host_context");
        var current = HostProtocol.Element(frame.Payload).GetProperty("currentObservation");
        var id = current.GetProperty("Reference").GetProperty("ObservationId").GetString();
        if (string.IsNullOrEmpty(id) || id == _observation) throw new InvalidOperationException("Fresh delivered observation required.");
        _observation = id;
        var data = current.GetProperty("Data");
        var capability = "maze.inspect";
        var input = new Dictionary<string, object?>();
        switch (data.GetProperty("scope").GetString())
        {
            case "actor" when _steps == 0:
                _actor = data.GetProperty("actor").Clone();
                input["scope"] = "objective";
                break;
            case "objective":
                if (data.GetProperty("status").GetString() == "satisfied")
                    throw new InvalidOperationException("Host completion must end the run before another planner call.");
                if (data.GetProperty("carried").GetInt32() == 1)
                {
                    capability = "maze.navigate"; Address(data.GetProperty("returnTo"), input);
                }
                else input["scope"] = "objects";
                break;
            case "objects":
                if (data.GetProperty("state").GetString() != "visible") throw new InvalidOperationException("No current dungeon sight.");
                var found = data.GetProperty("objects").EnumerateArray().FirstOrDefault(cell =>
                    cell.GetProperty("chests").EnumerateArray().Any(chest => !chest.GetProperty("opened").GetBoolean()));
                if (found.ValueKind != JsonValueKind.Undefined)
                {
                    var at = found.GetProperty("at");
                    if (SameAddress(at, _actor)) input["scope"] = "cell";
                    else capability = "maze.navigate";
                    Address(at, input);
                }
                else if (data.TryGetProperty("next", out var next))
                {
                    input["scope"] = "objects"; input["cursor"] = next.Clone();
                }
                else input["scope"] = "frontiers";
                break;
            case "frontiers":
                var entries = data.GetProperty("frontiers").EnumerateArray().ToArray();
                if (entries.Length == 0) throw new InvalidOperationException("No earned frontier: incomplete, not objective success.");
                var choice = entries[0];
                capability = "maze.explore"; input["frontier"] = choice.GetProperty("frontier").Clone();
                if (choice.GetProperty("at").GetProperty("spaceId").GetString() == _actor.GetProperty("spaceId").GetString())
                    input["mode"] = "room";
                break;
            case "cell":
                var cell = data.GetProperty("cell");
                if (cell.GetProperty("state").GetString() != "visible" || !SameAddress(cell.GetProperty("at"), _actor))
                    throw new InvalidOperationException("Chest must be freshly inspected at the actor.");
                var chest = cell.GetProperty("chests").EnumerateArray()
                    .Single(c => !c.GetProperty("opened").GetBoolean() && c.TryGetProperty("target", out _));
                capability = "maze.interact"; input["target"] = chest.GetProperty("target").Clone();
                break;
            default:
                throw new InvalidOperationException("Unexpected public corpus observation.");
        }
        var action = capability != "maze.inspect";
        _steps++; _counts!.Planned();
        return Task.FromResult(new WorkflowPlan("corpus-" + _steps, _steps,
            [new PlanStep("corpus-step-" + _steps, capability, action ? ToolKind.Action : ToolKind.Query,
                action ? ToolEffect.WritesLocalState : ToolEffect.ReadOnly, input)],
            "Explore an earned boundary, reconsider visible objects, explicitly collect, then return and verify. No hidden route."));
    }

    private static void Address(JsonElement at, Dictionary<string, object?> input)
    {
        foreach (var key in new[] { "level", "spaceId", "row", "column" }) input[key] = at.GetProperty(key).Clone();
    }
    private static bool SameAddress(JsonElement a, JsonElement b) =>
        new[] { "level", "spaceId", "row", "column" }.All(key => a.GetProperty(key).ToString() == b.GetProperty(key).ToString());
}
