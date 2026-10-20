using System.Text.Json;
using Agentica.Lab.Web.Contracts;
using Agentica.Observations;
using Agentica.Planning;
using Agentica.Tools;

namespace Maze.StartServiceFixture;

// Each address/selector comes from public host observations. The fixture never supplies a return coordinate.
internal sealed class ReturnSequencePlanner(DecisionPlannerCounters counters) : IWorkflowPlanner
{
    private int _stage;
    private int? _window;
    private string? _observation;
    private PlannerWindowCounters? _counts;

    public Task<WorkflowPlan> CreatePlanAsync(PlanningRequest request, CancellationToken cancellationToken = default)
    {
        if (_window is not null) throw new InvalidOperationException("No implicit return continuation.");
        _window = Window(request);
        _counts = _window == 0 ? counters.Initial : counters.Successor;
        _counts.Entered(); _counts.Called(false);
        return Next(request, cancellationToken);
    }

    public Task<WorkflowPlan> RefinePlanAsync(PlanningRequest request, Observation observation, CancellationToken cancellationToken = default)
    {
        if (_stage != 1 || _window != Window(request) || _window == 2)
            throw new InvalidOperationException("Host completion must end the final check without another choice.");
        _counts!.Called(true);
        return Next(request, cancellationToken);
    }

    private Task<WorkflowPlan> Next(PlanningRequest request, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var frame = request.ContextFrames.Single(f => f.Kind == "agentica.host_context");
        var current = HostProtocol.Element(frame.Payload).GetProperty("currentObservation");
        var observationId = current.GetProperty("Reference").GetProperty("ObservationId").GetString();
        var data = current.GetProperty("Data");
        if (string.IsNullOrEmpty(observationId) || observationId == _observation)
            throw new InvalidOperationException("Distinct real host observation required.");
        _observation = observationId;
        var input = new Dictionary<string, object?>();
        var action = _stage == 1;
        var capability = "maze.inspect";
        if (!action)
        {
            if (data.GetProperty("scope").GetString() != "actor")
                throw new InvalidOperationException("Each explicit window starts with the earned actor.");
            input["scope"] = _window == 0 ? "cell" : "objective";
            if (_window == 0)
                foreach (var name in new[] { "level", "spaceId", "row", "column" })
                    input[name] = data.GetProperty("actor").GetProperty(name).Clone();
        }
        else if (_window == 0)
        {
            var cell = data.GetProperty("cell");
            var choices = cell.GetProperty("chests").EnumerateArray()
                .Where(c => !c.GetProperty("opened").GetBoolean() && c.TryGetProperty("target", out _)).ToArray();
            if (data.GetProperty("scope").GetString() != "cell" || cell.GetProperty("state").GetString() != "visible" || choices.Length != 1)
                throw new InvalidOperationException("Explicit current-tile chest selection required.");
            capability = "maze.interact"; input["target"] = choices[0].GetProperty("target").Clone();
        }
        else
        {
            if (data.GetProperty("scope").GetString() != "objective" || data.GetProperty("status").GetString() != "pending"
                || data.GetProperty("carried").GetInt32() != 1 || data.GetProperty("atReturn").GetBoolean())
                throw new InvalidOperationException("An actual carried item and unfinished return are required.");
            capability = "maze.navigate";
            foreach (var name in new[] { "level", "spaceId", "row", "column" })
                input[name] = data.GetProperty("returnTo").GetProperty(name).Clone();
        }
        _stage++; _counts!.Planned();
        return Task.FromResult(new WorkflowPlan("return-" + _window + "-" + _stage, _stage,
            [new PlanStep("return-step-" + _stage, capability, action ? ToolKind.Action : ToolKind.Query,
                action ? ToolEffect.WritesLocalState : ToolEffect.ReadOnly, input)],
            "Explicit chest collection, earned return, then game-owned objective verification. No automatic reward or continuation."));
    }

    private static int Window(PlanningRequest request)
    {
        var continuation = HostProtocol.Element(request.Request.Context
            ?? throw new InvalidOperationException("Missing real request context.")).GetProperty("continuation");
        if (continuation.ValueKind == JsonValueKind.Null) return 0;
        var count = continuation.GetProperty("cumulativeUsage").GetProperty("continuations").GetInt32();
        var wake = continuation.GetProperty("wake");
        var operation = continuation.GetProperty("admission").GetProperty("operation").GetProperty("operationId").GetString();
        if (count is not (1 or 2) || wake.GetProperty("kind").GetString() != "decision"
            || wake.GetProperty("operationId").GetString() != operation
            || operation?.StartsWith(count == 1 ? "interact-" : "travel-", StringComparison.Ordinal) != true)
            throw new InvalidOperationException("Only explicit chest then navigation decisions may continue.");
        return count;
    }
}
