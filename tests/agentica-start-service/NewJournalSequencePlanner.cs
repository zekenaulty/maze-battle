using System.Text.Json;
using Agentica.Lab.Web.Contracts;
using Agentica.Observations;
using Agentica.Planning;
using Agentica.Tools;

namespace Maze.StartServiceFixture;

// Query only public accepted summaries/details, then park on the original earned tile.
internal sealed class NewJournalSequencePlanner(PlannerWindowCounters counters) : IWorkflowPlanner
{
    private int _stage;
    private string? _observation, _title;
    private JsonElement _actor;

    public Task<WorkflowPlan> CreatePlanAsync(PlanningRequest request, CancellationToken cancellationToken = default)
    {
        if (_stage != 0) throw new InvalidOperationException("No implicit journal continuation.");
        counters.Entered(); counters.Called(false); return Next(request, cancellationToken);
    }
    public Task<WorkflowPlan> RefinePlanAsync(PlanningRequest request, Observation observation, CancellationToken cancellationToken = default)
    {
        if (_stage is not (1 or 2)) throw new InvalidOperationException("Only the original journal query refinements are permitted.");
        counters.Called(true); return Next(request, cancellationToken);
    }
    private Task<WorkflowPlan> Next(PlanningRequest request, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var frame = request.ContextFrames.Single(frame => frame.Kind == "agentica.host_context");
        var current = HostProtocol.Element(frame.Payload).GetProperty("currentObservation");
        var id = current.GetProperty("Reference").GetProperty("ObservationId").GetString();
        var data = current.GetProperty("Data");
        var scope = _stage switch { 0 => "actor", 1 => "quests", _ => "quest" };
        if (string.IsNullOrEmpty(id) || id == _observation || data.GetProperty("scope").GetString() != scope)
            throw new InvalidOperationException("Journal choices require distinct real scoped observations.");
        _observation = id;
        var input = new Dictionary<string, object?>();
        if (_stage == 0)
        {
            _actor = data.GetProperty("actor").Clone();
            if (_actor.GetProperty("mode").GetString() == "town") throw new InvalidOperationException("Expected dungeon journal access.");
            input["scope"] = "quests"; input["status"] = "active";
        }
        else if (_stage == 1)
        {
            if (data.GetProperty("status").GetString() != "active") throw new InvalidOperationException("Wrong journal page.");
            var choices = data.GetProperty("quests").EnumerateArray().ToArray();
            if (choices.Length != 1) throw new InvalidOperationException("Expected exactly one publicly accepted fixture quest.");
            var selected = choices[0];
            _title = selected.GetProperty("title").GetString();
            input["scope"] = "quest"; input["target"] = selected.GetProperty("target").GetString();
        }
        else
        {
            var quest = data.GetProperty("quest");
            if (quest.GetProperty("title").GetString() != _title || quest.GetProperty("status").GetString() != "active"
                || quest.GetProperty("task").GetProperty("objective").GetString() != "fetch")
                throw new InvalidOperationException("Detail must describe the selected public fetch quest.");
            foreach (var field in new[] { "level", "spaceId", "row", "column" }) input[field] = _actor.GetProperty(field).Clone();
        }
        var action = _stage == 2; _stage++; counters.Planned();
        return Task.FromResult(new WorkflowPlan("journal-script-" + _stage, _stage,
            [new PlanStep("journal-step-" + _stage, action ? "maze.navigate" : "maze.inspect",
                action ? ToolKind.Action : ToolKind.Query, action ? ToolEffect.WritesLocalState : ToolEffect.ReadOnly, input)],
            "Read the accepted journal and selected detail, then park on the original tile. No collection, movement, reward or completion claim."));
    }
}
