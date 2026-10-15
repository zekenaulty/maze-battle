using System.Text.Json;
using Agentica.Lab.Web.Contracts;
using Agentica.Observations;
using Agentica.Planning;
using Agentica.Tools;

namespace Maze.StartServiceFixture;

// A closed four-action script, using only the real planner's earned host frame.
internal sealed class ObservationSequencePlanner(Action<bool> called, Action planned) : IWorkflowPlanner
{
    private int _stage;
    private JsonElement _actor;
    private JsonElement _target;
    private readonly HashSet<string> _observations = [];

    public Task<WorkflowPlan> CreatePlanAsync(PlanningRequest request, CancellationToken cancellationToken = default)
    {
        called(false);
        if (_stage != 0) throw new InvalidOperationException("No continuation is permitted.");
        return Next(request, cancellationToken);
    }

    public Task<WorkflowPlan> RefinePlanAsync(PlanningRequest request, Observation observation, CancellationToken cancellationToken = default)
    {
        called(true);
        if (_stage is < 1 or > 3) throw new InvalidOperationException("Only the three scripted query refinements are permitted.");
        return Next(request, cancellationToken);
    }

    private Task<WorkflowPlan> Next(PlanningRequest request, CancellationToken cancellationToken)
    {
        try { return Build(request, cancellationToken); }
        catch (Exception error)
        {
            Console.Error.WriteLine($"Scripted planner stage {_stage}: {error}");
            Console.Error.WriteLine(HostProtocol.Element(request.ContextFrames));
            throw;
        }
    }

    private Task<WorkflowPlan> Build(PlanningRequest request, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var frame = request.ContextFrames.Single(frame => frame.Kind == "agentica.host_context");
        var current = HostProtocol.Element(frame.Payload).GetProperty("currentObservation");
        var data = current.GetProperty("Data");
        var expectedScope = _stage switch { 1 => "map", 2 => "room", _ => "actor" };
        if (data.GetProperty("scope").GetString() != expectedScope ||
            !_observations.Add(current.GetProperty("Reference").GetProperty("ObservationId").GetString()!))
            throw new InvalidOperationException("The real service must retain a distinct observation for each scripted result.");
        if (_stage == 0)
        {
            _actor = data.GetProperty("actor").Clone();
            if (_actor.GetProperty("mode").GetString() == "town" || data.GetProperty("source").ValueKind != JsonValueKind.Object)
                throw new InvalidOperationException("The fixture needs an earned dungeon actor, not a fabricated target.");
        }
        if (_stage == 2)
        {
            var cells = data.GetProperty("cells").EnumerateArray().ToArray();
            var here = cells.Single(cell => SameAddress(cell.GetProperty("at"), _actor));
            _target = here.GetProperty("edges").EnumerateObject().Select(edge => edge.Value.GetProperty("target"))
                .First(at => at.ValueKind == JsonValueKind.Object && !SameAddress(at, _actor)
                    && cells.Any(cell => SameAddress(cell.GetProperty("at"), at))).Clone();
        }
        var input = new Dictionary<string, object?>();
        var tool = _stage switch { 0 or 1 => "maze.inspect", 2 => "maze.observe", _ => "maze.navigate" };
        if (_stage == 0) input["scope"] = "map";
        if (_stage is 1 or 3)
            foreach (var field in new[] { "level", "spaceId", "row", "column" }) input[field] = (_stage == 1 ? _actor : _target).GetProperty(field).Clone();
        if (_stage == 1) input["scope"] = "room";
        var navigation = _stage == 3;
        _stage++;
        planned();
        return Task.FromResult(new WorkflowPlan("observation-script-" + _stage, _stage,
            [new PlanStep("observation-step-" + _stage, tool, navigation ? ToolKind.Action : ToolKind.Query,
                navigation ? ToolEffect.WritesLocalState : ToolEffect.ReadOnly, input)], "Execute the next earned observation regression step."));
    }

    private static bool SameAddress(JsonElement left, JsonElement right) =>
        new[] { "level", "spaceId", "row", "column" }.All(field => left.GetProperty(field).ToString() == right.GetProperty(field).ToString());
}
