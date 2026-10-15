using Agentica.Clients.Llm;
using Agentica.Lab.Web.Providers;
using Agentica.Observations;
using Agentica.Planning;

namespace Maze.StartServiceFixture;

internal sealed class WaitingPlannerFactory : ILabPlannerFactory
{
    private int _created, _entered, _cancelled;
    public int Created => Volatile.Read(ref _created);
    public int Entered => Volatile.Read(ref _entered);
    public int Cancelled => Volatile.Read(ref _cancelled);
    public IReadOnlyList<ProviderMetadata> GetProviders() => [new("fixture", "wait-only", true, null, "cancellable-fixture")];
    public IWorkflowPlanner Create(ProviderSettings settings, Action<LlmStreamEvent> onStreamEvent)
    {
        if (settings.Provider != "fixture" || settings.Model != "wait-only")
            throw new InvalidOperationException("Only the wait-only fixture planner is permitted.");
        Interlocked.Increment(ref _created);
        return new WaitingPlanner(this);
    }
    private sealed class WaitingPlanner(WaitingPlannerFactory owner) : IWorkflowPlanner
    {
        public async Task<WorkflowPlan> CreatePlanAsync(PlanningRequest request, CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref owner._entered);
            try { await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken); }
            finally { Interlocked.Increment(ref owner._cancelled); }
            throw new InvalidOperationException("The fixture must never produce a plan.");
        }
        public Task<WorkflowPlan> RefinePlanAsync(PlanningRequest request, Observation observation, CancellationToken cancellationToken = default) =>
            throw new InvalidOperationException("The fixture must never refine or invoke a provider.");
    }
}
