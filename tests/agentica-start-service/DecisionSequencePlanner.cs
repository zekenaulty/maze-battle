using System.Text.Json;
using Agentica.Lab.Web.Contracts;
using Agentica.Observations;
using Agentica.Planning;

namespace Maze.StartServiceFixture;

// Only the real host continuation context distinguishes the two bounded activations.
internal sealed class DecisionSequencePlanner(bool fastTerminal, DecisionPlannerCounters counters, bool frontier = false) : IWorkflowPlanner
{
    private IWorkflowPlanner? _script;
    private bool? _successor;

    public Task<WorkflowPlan> CreatePlanAsync(PlanningRequest request, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (_successor is not null) throw new InvalidOperationException("No implicit planner continuation is permitted.");
        _successor = IsSuccessor(request);
        var window = _successor.Value ? counters.Successor : counters.Initial;
        window.Entered();
        if (_successor.Value && fastTerminal)
        {
            // The real runner rejects an empty plan and settles blocked, without a host action or completion proof.
            window.Called(false); window.Empty();
            return Task.FromResult(new WorkflowPlan("explicit-decision-terminal", 1, [],
                "No successor action is proposed. This empty plan is not objective completion."));
        }
        _script = frontier ? new FrontierSequencePlanner(window.Called, window.Planned)
            : new ObservationSequencePlanner(window.Called, window.Planned);
        return _script.CreatePlanAsync(request, cancellationToken);
    }

    public Task<WorkflowPlan> RefinePlanAsync(PlanningRequest request, Observation observation, CancellationToken cancellationToken = default)
    {
        if (_script is null || _successor != IsSuccessor(request))
            throw new InvalidOperationException("Only the original explicit decision script may refine.");
        return _script.RefinePlanAsync(request, observation, cancellationToken);
    }

    private static bool IsSuccessor(PlanningRequest request)
    {
        var context = HostProtocol.Element(request.Request.Context
            ?? throw new InvalidOperationException("Missing real host request context."));
        if (!context.TryGetProperty("continuation", out var continuation))
            throw new InvalidOperationException("Missing real host continuation field.");
        if (continuation.ValueKind == JsonValueKind.Null) return false;
        var wake = continuation.GetProperty("wake");
        if (wake.GetProperty("kind").GetString() != "decision"
            || string.IsNullOrEmpty(continuation.GetProperty("parentRunId").GetString())
            || continuation.GetProperty("admission").GetProperty("operation").ValueKind != JsonValueKind.Object
            || continuation.GetProperty("cumulativeUsage").GetProperty("continuations").GetInt32() != 1)
            throw new InvalidOperationException("Only one explicit admitted-navigation decision wake is permitted.");
        return true;
    }
}
