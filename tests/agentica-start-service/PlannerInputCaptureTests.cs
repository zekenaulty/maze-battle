using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Agentica.Observations;
using Agentica.Planning;
using Agentica.Requests;
using Agentica.Tools;

namespace Maze.StartServiceFixture;

internal static class PlannerInputCaptureTests
{
    public static async Task Run()
    {
        var data = new Dictionary<string, object?> { ["unknownPublicField"] = new[] { "exact", "values" } };
        var request = Request("root", "initial") with
        {
            ContextFrames = [new("frame", "arbitrary", "1", DateTimeOffset.UnixEpoch, data, []) { CompactPayload = data }],
            ToolDescriptors = [new("tool", "name", ToolKind.Query, ToolEffect.ReadOnly, Description: "unfiltered")]
        };
        var observation = new Observation("obs", "step", ObservationKind.ToolResult, "result", data, []);
        var capture = new PlannerInputCapture();
        var policy = new Probe(() => { data["unknownPublicField"] = "mutated by policy"; });
        var planner = new CapturingCorpusPlanner(capture, policy);
        await planner.RefinePlanAsync(request, observation);
        var entry = capture.Snapshot().Single();
        var saved = JsonDocument.Parse(entry.Raw).RootElement;
        Check(saved.GetProperty("refinementObservation").GetProperty("Data").GetProperty("unknownPublicField").GetArrayLength() == 2);
        var input = saved.GetProperty("request");
        Check(input.GetProperty("SessionContext").GetProperty("RunId").GetString() == "initial");
        Check(input.GetProperty("Request").GetProperty("AuthorizationScopeId").GetString() == "scope");
        Check(input.GetProperty("ContextFrames")[0].GetProperty("CompactPayload").GetProperty("unknownPublicField").GetArrayLength() == 2);
        Check(input.GetProperty("ToolDescriptors")[0].GetProperty("Description").GetString() == "unfiltered");
        Check(entry.Bytes == Encoding.UTF8.GetByteCount(entry.Raw));
        Check(entry.Sha256 == Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(entry.Raw))));
        var copy = capture.Snapshot(); copy[0] = entry with { Raw = "tampered" };
        Check(capture.Snapshot().Single() == entry && policy.Calls == 1);
        Console.WriteLine("PASS complete pre-policy snapshot, ignored public members, hash, immutable read API");

        capture = new();
        for (var root = 0; root < PlannerInputCapture.MaxRoots; root++)
            for (var window = 0; window < PlannerInputCapture.MaxWindows; window++)
                for (var call = 0; call < PlannerInputCapture.MaxCalls; call++) capture.Add(Request("root" + root, "window" + window), null);
        var before = capture.Snapshot();
        Refuses(() => capture.Add(Request("root0", "window0"), null), "count bound");
        Refuses(() => capture.Add(Request("root0", "new-window"), null), "count bound");
        Refuses(() => capture.Add(Request("new-root", "window0"), null), "count bound");
        Check(before.SequenceEqual(capture.Snapshot()));
        Console.WriteLine("PASS root, window and call exhaustion refuse without altering evidence");

        capture = new();
        var huge = Request("root", "initial") with { Request = new(new string('x', PlannerInputCapture.MaxBytes),
            Context: new Dictionary<string, object?> { ["sessionId"] = "root" }) };
        policy = new Probe(() => {}); planner = new(capture, policy);
        Refuses(() => planner.CreatePlanAsync(huge).GetAwaiter().GetResult(), "byte bound");
        Check(policy.Calls == 0 && capture.Snapshot().Length == 0);
        await planner.CreatePlanAsync(Request("root", "initial"));
        Check(policy.Calls == 1 && capture.Snapshot().Single().Method == "create");
        Console.WriteLine("PASS oversize fails before policy, no partial capture, create entry retained");
    }

    private static PlanningRequest Request(string root, string window) => new(new RunRequest("objective",
        Context: new Dictionary<string, object?> { ["sessionId"] = root }, AuthorizationScopeId: "scope"), [], [], [])
    { SessionContext = new(window, "objective", RequestOrigin.User) };
    private static void Check(bool condition) { if (!condition) throw new InvalidOperationException("Capture assertion failed"); }
    private static void Refuses(Action action, string text)
    {
        try { action(); } catch (InvalidOperationException error) when (error.Message.Contains(text)) { return; }
        throw new InvalidOperationException("Expected explicit capture refusal: " + text);
    }
    private sealed class Probe(Action mutate) : IWorkflowPlanner
    {
        public int Calls { get; private set; }
        public Task<WorkflowPlan> CreatePlanAsync(PlanningRequest request, CancellationToken cancellationToken = default)
        { Calls++; mutate(); return Task.FromResult(new WorkflowPlan("plan", 1, [], "test")); }
        public Task<WorkflowPlan> RefinePlanAsync(PlanningRequest request, Observation observation, CancellationToken cancellationToken = default) =>
            CreatePlanAsync(request, cancellationToken);
    }
}
