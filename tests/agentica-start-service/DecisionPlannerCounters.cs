namespace Maze.StartServiceFixture;

internal sealed class DecisionPlannerCounters
{
    private int _created;
    public PlannerWindowCounters Initial { get; } = new();
    public PlannerWindowCounters Successor { get; } = new();
    public void Created() => Interlocked.Increment(ref _created);
    public object Snapshot() => new { created = Volatile.Read(ref _created), initial = Initial.Snapshot(), successor = Successor.Snapshot() };
}

internal sealed class PlannerWindowCounters
{
    private int _instances, _createCalls, _refineCalls, _stepsPlanned, _emptyPlans;
    public void Entered() => Interlocked.Increment(ref _instances);
    public void Called(bool refinement)
    {
        if (refinement) Interlocked.Increment(ref _refineCalls);
        else Interlocked.Increment(ref _createCalls);
    }
    public void Planned() => Interlocked.Increment(ref _stepsPlanned);
    public void Empty() => Interlocked.Increment(ref _emptyPlans);
    public object Snapshot() => new
    {
        instances = Volatile.Read(ref _instances), createCalls = Volatile.Read(ref _createCalls),
        refineCalls = Volatile.Read(ref _refineCalls), stepsPlanned = Volatile.Read(ref _stepsPlanned), emptyPlans = Volatile.Read(ref _emptyPlans)
    };
}
