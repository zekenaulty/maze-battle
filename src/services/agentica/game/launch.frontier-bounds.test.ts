// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { readGameAgenticaProfile } from '../../../config/agentica';
import { readCanonical } from '../../../persistence/canonical/read';
import { earnedCell } from '../../../persistence/canonical/knowledge/region.test-support';
import { launchStart } from '../../../persistence/canonical/agentica/launch.wire';
import type { CanonicalHostPort } from '../../game/CanonicalHostCommand';
import type { AgenticaStart } from '../contracts';
import { prepareGameLaunch } from './launch';
import { perceptionFixture } from './observation.test-support';

vi.mock('../../../persistence/canonical/read', async importOriginal => ({
  ...await importOriginal<typeof import('../../../persistence/canonical/read')>(), readCanonical: vi.fn(),
}));
beforeEach(() => vi.clearAllMocks());

async function actualStart(objective: string, env: Record<string, string> = {}) {
  const f = await perceptionFixture([earnedCell(0, 0, 'entry', 3, 3)]);
  f.head.gameId = crypto.randomUUID(); f.head.revision = 12345; f.republish();
  const attemptId = crypto.randomUUID();
  f.ref.key = `agentica/publications/${attemptId}`; f.ref.id = crypto.randomUUID();
  f.publication.sourceAttemptId = f.publication.sourceRequest.attemptId = attemptId;
  const profile = readGameAgenticaProfile({ VITE_AGENTICA_ENDPOINT: 'ws://127.0.0.1:5079/api/host',
    VITE_AGENTICA_PROVIDER: 'fixture', VITE_AGENTICA_MODEL: 'fixture-model', ...env }).profile!;
  let start: AgenticaStart | undefined;
  vi.mocked(readCanonical).mockImplementation(async work => {
    start = await work(f.pages as never, f.snapshot) as AgenticaStart;
    return { value: start } as never;
  });
  const submitHostCommand = vi.fn(async command => {
    if (command.operation === 'agentica.publish') return { result: { reference: f.ref } };
    expect(command.operation).toBe('operation.admit'); return {};
  });
  const port = { hostSignal: new AbortController().signal, submitHostCommand } as unknown as CanonicalHostPort;
  let error: unknown;
  try { await prepareGameLaunch(port, { ...profile, objectiveId: crypto.randomUUID(), objective }); }
  catch (caught) { error = caught; }
  expect(start).toBeDefined();
  return { start: start!, bytes: new TextEncoder().encode(JSON.stringify(start)).length, error, submitHostCommand };
}

it.each([
  ['default fixture', 3007, {}],
  ['decision-frontier', 3010, { VITE_AGENTICA_MODEL: 'decision-frontier', VITE_AGENTICA_MAX_STEPS: '4', VITE_AGENTICA_MAX_REFINEMENTS: '2',
    VITE_AGENTICA_MAX_PLAN_CONTINUATIONS: '1', VITE_AGENTICA_TIMEOUT_SECONDS: '90', VITE_AGENTICA_ACTION_TIMEOUT_SECONDS: '20' }],
  ['configured OpenAI', 3033, { VITE_AGENTICA_PROVIDER: 'openai', VITE_AGENTICA_MODEL: 'configured-model', VITE_AGENTICA_THINKING_EFFORT: 'high' }],
] as const)('fits actual %s start with a 512-character ASCII objective', async (name, expectedBytes, env) => {
  const f = await actualStart('x'.repeat(512), env);
  console.info(`${name}: ${f.bytes} bytes; objective 512; session ${f.start.sessionId.length}; observation ${JSON.stringify(f.start.observation).length}`);
  expect(f.error).toBeUndefined(); expect(f.bytes).toBe(expectedBytes); expect(f.bytes).toBeLessThanOrEqual(3072);
  expect(f.start.capabilities.map(c => c.id)).toEqual(['maze.observe', 'maze.inspect', 'maze.navigate', 'maze.explore']);
  expect(f.start.objective).toBe('x'.repeat(512)); expect(f.submitHostCommand).toHaveBeenCalledTimes(2);
});

it.each([['multibyte', '\u754c'], ['escaped', '"']] as const)('keeps the aggregate byte bound for a 512-character %s objective', async (name, character) => {
  const objective = character.repeat(512), f = await actualStart(objective);
  console.info(`${name}: ${f.bytes} bytes; objective ${objective.length}`);
  expect(f.bytes).toBeGreaterThan(3072); expect(String(f.error)).toMatch(/(3072|4096) bytes/);
  expect(() => launchStart(f.start)).toThrow('3072 bytes');
  expect(f.start.objective).toBe(objective);
  expect(f.submitHostCommand.mock.calls.map(([command]) => command.operation)).toEqual(['agentica.publish']);
});
