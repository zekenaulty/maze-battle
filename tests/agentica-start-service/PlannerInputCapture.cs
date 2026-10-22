using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Json.Serialization.Metadata;
using Agentica.Observations;
using Agentica.Planning;

namespace Maze.StartServiceFixture;

// Test output only. Neither the policy nor the service consumes a captured input.
internal sealed class PlannerInputCapture
{
    public const int MaxRoots = 2, MaxWindows = 2, MaxCalls = 8, MaxBytes = 262144;
    private readonly object _gate = new();
    private readonly List<Entry> _entries = [];
    private static readonly JsonSerializerOptions Json = Options();
    internal sealed record Entry(string Root, string Window, int Call, string Method, int Bytes, string Sha256, string Raw);

    public void Add(PlanningRequest request, Observation? observation)
    {
        if (request.Request.Context?.GetValueOrDefault("sessionId") is not string { Length: > 0 } root)
            throw new InvalidOperationException("Capture requires the public session identity.");
        var window = request.SessionContext?.RunId ?? throw new InvalidOperationException("Capture requires a runner identity.");
        lock (_gate)
        {
            var roots = _entries.Select(e => e.Root).Distinct().ToArray();
            var windows = _entries.Where(e => e.Root == root).Select(e => e.Window).Distinct().ToArray();
            var call = _entries.Count(e => e.Root == root && e.Window == window);
            if ((!roots.Contains(root) && roots.Length >= MaxRoots) ||
                (!windows.Contains(window) && windows.Length >= MaxWindows) || call >= MaxCalls)
                throw new InvalidOperationException("Planner input capture count bound exhausted; no partial capture.");
            using var stream = new LimitedStream();
            // Restore JsonIgnored public members too: SessionContext, CompactPayload and authorization scope.
            // No provider settings/environment are supplied here; the dedicated factory is offline-only.
            JsonSerializer.Serialize(stream, new { request, refinementObservation = observation }, Json);
            var bytes = stream.ToArray();
            _entries.Add(new(root, window, call, observation is null ? "create" : "refine", bytes.Length,
                Convert.ToHexStringLower(SHA256.HashData(bytes)), Encoding.UTF8.GetString(bytes)));
        }
    }

    public Entry[] Snapshot() { lock (_gate) return _entries.ToArray(); }

    private static JsonSerializerOptions Options()
    {
        var resolver = new DefaultJsonTypeInfoResolver();
        resolver.Modifiers.Add(info =>
        {
            foreach (var property in info.Properties)
                if (property.AttributeProvider is PropertyInfo member && member.GetMethod?.IsPublic == true &&
                    member.GetCustomAttribute<JsonIgnoreAttribute>() is not null)
                {
                    property.Get = member.GetValue;
                    property.ShouldSerialize = null;
                }
        });
        return new JsonSerializerOptions { MaxDepth = 64, TypeInfoResolver = resolver };
    }

    private sealed class LimitedStream : MemoryStream
    {
        public override void Write(byte[] buffer, int offset, int count)
        {
            Check(count); base.Write(buffer, offset, count);
        }
        public override void Write(ReadOnlySpan<byte> buffer) { Check(buffer.Length); base.Write(buffer); }
        private void Check(int count)
        {
            if (Length + count > MaxBytes) throw new InvalidOperationException("Planner input capture byte bound exhausted; no partial capture.");
        }
    }
}

internal sealed class CapturingCorpusPlanner(PlannerInputCapture capture, IWorkflowPlanner policy) : IWorkflowPlanner
{
    public Task<WorkflowPlan> CreatePlanAsync(PlanningRequest request, CancellationToken cancellationToken = default)
    {
        capture.Add(request, null);
        return policy.CreatePlanAsync(request, cancellationToken);
    }
    public Task<WorkflowPlan> RefinePlanAsync(PlanningRequest request, Observation observation, CancellationToken cancellationToken = default)
    {
        capture.Add(request, observation);
        return policy.RefinePlanAsync(request, observation, cancellationToken);
    }
}
