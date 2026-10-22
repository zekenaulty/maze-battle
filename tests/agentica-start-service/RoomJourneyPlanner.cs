using System.Text.Encodings.Web;
using System.Text.Json;
using Agentica.Lab.Web.Contracts;
using Agentica.Observations;
using Agentica.Planning;
using Agentica.Tools;

namespace Maze.StartServiceFixture;

// Two fixture objectives maximum. Only public observations enter this volatile policy memory;
// browser adoption is covered, service-process restart is deliberately not claimed.
internal sealed class RoomJourneyPolicies
{
    internal sealed class State
    {
        public string Phase = "scout", ChestRoom = "", Session = "";
        public int Window;
        public JsonElement? Expected;
    }
    private readonly Dictionary<string, State> _states = new();
    public State Enter(JsonElement context)
    {
        var id = context.GetProperty("objectiveId").GetString()!;
        var session = context.GetProperty("sessionId").GetString()!;
        var continuation = context.GetProperty("continuation");
        if (continuation.ValueKind == JsonValueKind.Null)
        {
            if (_states.Count >= 2 || _states.ContainsKey(id)) throw new InvalidOperationException("Duplicate or excess journey root.");
            return _states[id] = new State { Session = session };
        }
        if (!_states.TryGetValue(id, out var state) || state.Session != session
            || continuation.GetProperty("wake").GetProperty("kind").GetString() != "decision"
            || continuation.GetProperty("cumulativeUsage").GetProperty("continuations").GetInt32() != ++state.Window
            || state.Window > 16)
            throw new InvalidOperationException("Unknown, repeated or exhausted journey continuation.");
        return state;
    }
}

internal sealed class RoomJourneyPlanner(DecisionPlannerCounters counters, RoomJourneyPolicies policies) : IWorkflowPlanner
{
    private static readonly JsonSerializerOptions WireJson = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    private RoomJourneyPolicies.State? _state;
    private PlannerWindowCounters? _counts;
    private JsonElement _actor, _entrance, _selected;
    private string? _observation;
    private int _steps, _mapPages, _rooms, _connections;
    private readonly HashSet<string> _roomIds = new();

    public Task<WorkflowPlan> CreatePlanAsync(PlanningRequest request, CancellationToken cancellationToken = default)
    {
        if (_state is not null) throw new InvalidOperationException("No implicit journey continuation.");
        _state = policies.Enter(HostProtocol.Element(request.Request.Context!));
        _counts = _state.Window == 0 ? counters.Initial : counters.Successor;
        _counts.Entered(); _counts.Called(false);
        return Next(request, cancellationToken);
    }
    public Task<WorkflowPlan> RefinePlanAsync(PlanningRequest request, Observation observation, CancellationToken cancellationToken = default)
    {
        if (_state is null || _steps >= 16) throw new InvalidOperationException("Journey query window exhausted.");
        _counts!.Called(true);
        return Next(request, cancellationToken);
    }
    private Task<WorkflowPlan> Next(PlanningRequest request, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var current = HostProtocol.Element(request.ContextFrames.Single(f => f.Kind == "agentica.host_context").Payload)
            .GetProperty("currentObservation");
        var id = current.GetProperty("Reference").GetProperty("ObservationId").GetString();
        if (string.IsNullOrEmpty(id) || id == _observation) throw new InvalidOperationException("Fresh delivered observation required.");
        _observation = id;
        var data = current.GetProperty("Data");
        // The planning snapshot escapes embedded JSON quotes as Unicode; charge compact wire JSON instead.
        if (JsonSerializer.SerializeToUtf8Bytes(data, WireJson).Length > 2800) throw new InvalidOperationException("Unbounded public input.");
        var state = _state!;
        var capability = "maze.inspect";
        var input = new Dictionary<string, object?>();
        switch (data.GetProperty("scope").GetString())
        {
            case "actor" when _steps == 0:
                _actor = data.GetProperty("actor").Clone();
                if (state.Expected is { } expected && !Same(expected, _actor))
                    throw new InvalidOperationException("Previous destination did not arrive; no replacement route or allowance.");
                state.Expected = null;
                input["scope"] = "objective";
                break;
            case "objective":
                if (data.GetProperty("status").GetString() == "satisfied") throw new InvalidOperationException("Host completion must terminate planning.");
                _entrance = data.GetProperty("returnTo").Clone();
                if (data.GetProperty("carried").GetInt32() == 1)
                {
                    capability = "maze.navigate"; Address(_entrance, input); state.Expected = _entrance;
                }
                else input["scope"] = state.Phase == "choose" ? "map" : "objects";
                break;
            case "objects":
                if (data.GetProperty("state").GetString() != "visible") throw new InvalidOperationException("Current sight required.");
                var found = data.GetProperty("objects").EnumerateArray().FirstOrDefault(cell =>
                    cell.GetProperty("chests").EnumerateArray().Any(c => !c.GetProperty("opened").GetBoolean()));
                if (found.ValueKind != JsonValueKind.Undefined)
                {
                    var at = found.GetProperty("at");
                    if (state.Phase == "scout")
                    {
                        state.ChestRoom = at.GetProperty("spaceId").GetString()!;
                        if (state.ChestRoom.Length > 128) throw new InvalidOperationException("Unbounded room identity.");
                        input["scope"] = "map";
                    }
                    else
                    {
                        if (state.Phase != "retrieve" || at.GetProperty("spaceId").GetString() != state.ChestRoom)
                            throw new InvalidOperationException("Retrieval must use the publicly selected room.");
                        if (Same(at, _actor)) input["scope"] = "cell";
                        else { capability = "maze.navigate"; state.Expected = at.Clone(); }
                        Address(at, input);
                    }
                }
                else if (data.TryGetProperty("next", out var objectNext))
                { input["scope"] = "objects"; input["cursor"] = objectNext.Clone(); }
                else if (state.Phase == "scout") input["scope"] = "frontiers";
                else throw new InvalidOperationException("Selected room has no currently disclosed chest; qualification incomplete.");
                break;
            case "frontiers":
                var candidates = data.GetProperty("frontiers").EnumerateArray().ToArray();
                if (candidates.Length == 0) throw new InvalidOperationException("No earned frontier; qualification incomplete.");
                var choice = candidates[0];
                capability = "maze.explore"; input["frontier"] = choice.GetProperty("frontier").Clone();
                if (choice.GetProperty("at").GetProperty("spaceId").GetString() == _actor.GetProperty("spaceId").GetString())
                    input["mode"] = "room";
                break;
            case "map":
                if (++_mapPages > 2) throw new InvalidOperationException("Journey map exceeds two public pages.");
                foreach (var room in data.GetProperty("rooms").EnumerateArray())
                {
                    if (!_roomIds.Add(room.GetProperty("spaceId").GetString()!)) throw new InvalidOperationException("Repeated room in pinned pages.");
                    _rooms++;
                    if (room.GetProperty("spaceId").GetString() == state.ChestRoom)
                    {
                        if (_mapPages != 2) throw new InvalidOperationException("Disclosed chest room is not a later-page choice.");
                        _selected = room.Clone();
                    }
                }
                if (data.TryGetProperty("next", out var mapNext))
                { input["scope"] = "map"; input["cursor"] = mapNext.Clone(); }
                else
                {
                    if (_rooms < 3 || _selected.ValueKind == JsonValueKind.Undefined)
                        throw new InvalidOperationException("Need three earned rooms and a disclosed later-page chest room.");
                    if (state.Phase == "scout")
                    {
                        state.Phase = "choose"; state.Expected = _entrance;
                        capability = "maze.navigate"; Address(_entrance, input);
                    }
                    else
                    {
                        if (state.Phase != "choose" || !Same(_actor, _entrance)) throw new InvalidOperationException("Room selection must start at earned entrance.");
                        input["scope"] = "connections"; input["level"] = _selected.GetProperty("level").Clone();
                        input["spaceId"] = state.ChestRoom;
                    }
                }
                break;
            case "connections":
                if (data.GetProperty("state").GetString() is not ("complete" or "partial")
                    || data.GetProperty("coverage").GetString() != "indexed-exits"
                    || data.GetProperty("connections").GetArrayLength() == 0 || ++_connections > 2)
                    throw new InvalidOperationException("No bounded earned room connection; never infer an unknown exit.");
                // A partial result is retained as partial, never used as a route or complete-room assertion.
                var anchor = _selected.GetProperty("anchor").GetProperty("at");
                var target = new Dictionary<string, object?> { ["level"] = anchor.GetProperty("level").Clone() };
                foreach (var key in new[] { "spaceId", "row", "column" }) target[key] = anchor.GetProperty("cell").GetProperty(key).Clone();
                capability = "maze.navigate"; input = target;
                state.Expected = HostProtocol.Element(target).Clone(); state.Phase = "retrieve";
                break;
            case "cell":
                var cell = data.GetProperty("cell");
                if (state.Phase != "retrieve" || cell.GetProperty("state").GetString() != "visible" || !Same(cell.GetProperty("at"), _actor))
                    throw new InvalidOperationException("Fresh selected current-tile inspection required.");
                capability = "maze.interact";
                input["target"] = cell.GetProperty("chests").EnumerateArray().Single(c =>
                    !c.GetProperty("opened").GetBoolean() && c.TryGetProperty("target", out _)).GetProperty("target").Clone();
                break;
            default: throw new InvalidOperationException("Unexpected journey observation.");
        }
        var action = capability != "maze.inspect";
        _steps++; _counts!.Planned();
        return Task.FromResult(new WorkflowPlan("room-journey-" + _steps, _steps,
            [new PlanStep("room-journey-step-" + _steps, capability, action ? ToolKind.Action : ToolKind.Query,
                action ? ToolEffect.WritesLocalState : ToolEffect.ReadOnly, input)],
            "Scout, return, select a later-page earned room, retrieve its disclosed item, and return. No hidden route."));
    }
    private static void Address(JsonElement at, Dictionary<string, object?> input)
    { foreach (var key in new[] { "level", "spaceId", "row", "column" }) input[key] = at.GetProperty(key).Clone(); }
    private static bool Same(JsonElement a, JsonElement b) => new[] { "level", "spaceId", "row", "column" }
        .All(key => a.GetProperty(key).ToString() == b.GetProperty(key).ToString());
}
