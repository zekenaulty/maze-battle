using Agentica.Clients.Llm;
using Agentica.Lab.Web.Providers;
using Agentica.Observations;
using Agentica.Planning;

namespace Maze.StartServiceFixture;

internal sealed class WaitingPlannerFactory : ILabPlannerFactory
{
    private int _created, _entered, _cancelled, _scriptedCreated, _scriptedCreateCalls, _scriptedRefineCalls, _scriptedStepsPlanned;
    public int Created => Volatile.Read(ref _created);
    public int Entered => Volatile.Read(ref _entered);
    public int Cancelled => Volatile.Read(ref _cancelled);
    public int ScriptedCreated => Volatile.Read(ref _scriptedCreated);
    public int ScriptedCreateCalls => Volatile.Read(ref _scriptedCreateCalls);
    public int ScriptedRefineCalls => Volatile.Read(ref _scriptedRefineCalls);
    public int ScriptedStepsPlanned => Volatile.Read(ref _scriptedStepsPlanned);
    public IReadOnlyList<ProviderMetadata> GetProviders() => [new("fixture", "wait-only", true, null, "cancellable-or-scripted-offline-fixture")];
    public IWorkflowPlanner Create(ProviderSettings settings, Action<LlmStreamEvent> onStreamEvent)
    {
        if (settings.Provider != "fixture" || settings.Model is not ("wait-only" or "observation-sequence"))
            throw new InvalidOperationException("Only the two explicit offline fixture planners are permitted.");
        Interlocked.Increment(ref _created);
        if (settings.Model == "observation-sequence")
        {
            Interlocked.Increment(ref _scriptedCreated);
            return new ObservationSequencePlanner(refinement =>
            {
                if (refinement) Interlocked.Increment(ref _scriptedRefineCalls);
                else Interlocked.Increment(ref _scriptedCreateCalls);
            }, () => Interlocked.Increment(ref _scriptedStepsPlanned));
        }
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
