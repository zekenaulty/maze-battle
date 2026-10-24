using System.Runtime.CompilerServices;
using Agentica.Clients.Llm;
using Agentica.Clients.Planning;
using Agentica.Planning;

namespace Maze.StartServiceFixture;

// Exercises the real planner/telemetry/socket chain without a credential or HTTP client.
internal sealed class MonitorStreamingClient(string scenario) : ILlmStreamingClient
{
    private const string Plan = """
        {"planId":"monitor-plan","steps":[{"stepId":"inspect","toolId":"fixture.observe","kind":"Query","effect":"ReadOnly","input":{}}]}
        """;

    public static IWorkflowPlanner Planner(string scenario, Action<LlmStreamEvent> callback) =>
        new LlmWorkflowPlanner(new MonitorStreamingClient(scenario), new LlmPlannerOptions(
            ModelId: scenario, GenerationOptions: new LlmGenerationOptions(MaxOutputTokens: 4096),
            InvalidJsonRepairAttempts: 0)
        { ContextWindowBudget = new LlmContextWindowBudget(65536, 4096) }, callback);

    public Task<LlmResponse> GenerateAsync(LlmRequest request, CancellationToken cancellationToken = default) =>
        throw new InvalidOperationException("Only the observed provider-free stream is allowed.");

    public async IAsyncEnumerable<LlmStreamEvent> StreamAsync(LlmRequest request,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        await Task.Yield();
        if (scenario == "monitor-cancelled")
            await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
        // Overflow the bounded display feed; receiving actual loss is asserted by the browser test.
        for (var n = 0; n < 2048; n++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            yield return new LlmStreamEvent(LlmStreamEventKind.TextDelta, " ");
        }
        yield return new LlmStreamEvent(LlmStreamEventKind.TextDelta, Plan);
        yield return new LlmStreamEvent(LlmStreamEventKind.Completed, Response: new LlmResponse(
            "fixture", scenario, Plan, Usage: scenario == "monitor-missing" ? null : new LlmUsage(4201, 681, 423),
            FinishReason: LlmFinishReason.Stop));
    }
}
