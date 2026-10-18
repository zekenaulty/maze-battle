// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readGameAgenticaProfile } from './agentica';
import { launchStart } from '../persistence/canonical/agentica/launch.wire';
import { launchStartFixture } from '../persistence/canonical/agentica/launch.test-support';

const configured = () => ({ VITE_AGENTICA_ENDPOINT: 'ws://127.0.0.1:5079/api/host',
  VITE_AGENTICA_PROVIDER: 'fixture', VITE_AGENTICA_MODEL: 'fixture-model' });
const defaults = { endpoint: 'ws://127.0.0.1:5079/api/host', provider: { provider: 'fixture', model: 'fixture-model',
  contextWindowTokens: 8192, maxOutputTokens: 256 }, limits: { maxSteps: 8, maxRefinements: 6,
  maxPlanContinuations: 0, timeoutSeconds: 120, actionTimeoutSeconds: 15 } };
const numericKeys = ['CONTEXT_WINDOW_TOKENS', 'MAX_OUTPUT_TOKENS', 'MAX_STEPS', 'MAX_REFINEMENTS',
  'MAX_PLAN_CONTINUATIONS', 'TIMEOUT_SECONDS', 'ACTION_TIMEOUT_SECONDS'] as const;
function invalid(env: Record<string, unknown>) {
  const result = readGameAgenticaProfile(env);
  expect(result.profile).toBeUndefined(); expect(result.error).toEqual(expect.any(String)); expect(result.error).not.toBe('');
  return result.error!;
}
afterEach(() => vi.unstubAllGlobals());

describe('public App Agentica profile', () => {
  it('is disabled when absent and ignores unrelated environment values', () => {
    expect(readGameAgenticaProfile({})).toEqual({});
    expect(readGameAgenticaProfile({ DEV: true, VITE_MAZE_TRAVEL_STEPS: '64', OPENAI_API_KEY: 'never-read',
      VITE_AGENTICA_ENDPOINT: undefined })).toEqual({});
  });
  it.each(['ENDPOINT', 'PROVIDER', 'MODEL'])('requires all three settings when %s is absent', field => {
    const env: Record<string, unknown> = configured(); delete env[`VITE_AGENTICA_${field}`]; invalid(env);
    invalid({ [`VITE_AGENTICA_${field}`]: configured()[`VITE_AGENTICA_${field}` as keyof ReturnType<typeof configured>] });
  });
  it.each(['', ' ', null, false, 123])('does not silently disable incomplete config %j', value => {
    for (const field of ['ENDPOINT', 'PROVIDER', 'MODEL']) invalid({ ...configured(), [`VITE_AGENTICA_${field}`]: value });
  });
  it('provides bounded defaults accepted by the authoritative Start validator', () => {
    const result = readGameAgenticaProfile(configured()); expect(result).toEqual({ profile: defaults });
    const { provider, limits } = result.profile!;
    expect(() => launchStart({ ...launchStartFixture(), provider, limits })).not.toThrow();
    expect(provider).not.toHaveProperty('thinkingEffort');
  });
  it('accepts explicit OpenAI and thinking effort without inferring a model', () => {
    const result = readGameAgenticaProfile({ ...configured(), VITE_AGENTICA_PROVIDER: 'openai',
      VITE_AGENTICA_MODEL: 'explicit-model', VITE_AGENTICA_THINKING_EFFORT: 'high' });
    expect(result.profile!.provider).toEqual({ ...defaults.provider, provider: 'openai', model: 'explicit-model', thinkingEffort: 'high' });
  });
  it.each(['gemini', 'OpenAI', 'default'])('refuses unsupported provider %s', provider => {
    invalid({ ...configured(), VITE_AGENTICA_PROVIDER: provider });
  });
  it.each(['', ' ', '\nlow', 'x'.repeat(129), false, null])('reuses provider identity validation for %j', value => {
    invalid({ ...configured(), VITE_AGENTICA_MODEL: value });
    invalid({ ...configured(), VITE_AGENTICA_THINKING_EFFORT: value });
  });
  it('accepts every explicit numeric override including zero only for refinements and continuations', () => {
    const profile = readGameAgenticaProfile({ ...configured(), VITE_AGENTICA_CONTEXT_WINDOW_TOKENS: '16384',
      VITE_AGENTICA_MAX_OUTPUT_TOKENS: '512', VITE_AGENTICA_MAX_STEPS: '12', VITE_AGENTICA_MAX_REFINEMENTS: '0',
      VITE_AGENTICA_MAX_PLAN_CONTINUATIONS: '2', VITE_AGENTICA_TIMEOUT_SECONDS: '180', VITE_AGENTICA_ACTION_TIMEOUT_SECONDS: '20' }).profile!;
    expect(profile.provider).toEqual({ ...defaults.provider, contextWindowTokens: 16384, maxOutputTokens: 512 });
    expect(profile.limits).toEqual({ maxSteps: 12, maxRefinements: 0, maxPlanContinuations: 2, timeoutSeconds: 180, actionTimeoutSeconds: 20 });
    expect(() => launchStart({ ...launchStartFixture(), provider: profile.provider, limits: profile.limits })).not.toThrow();
  });
  it.each(numericKeys)('refuses invalid %s instead of falling back', key => {
    for (const value of ['', ' ', '-1', '1.5', '1e3', '0x10', '01', 'Infinity', 'NaN', 'unlimited', '4garbage', '9007199254740992', 8, null, false]) {
      expect(invalid({ ...configured(), [`VITE_AGENTICA_${key}`]: value })).toContain(`VITE_AGENTICA_${key}`);
    }
    if (!['MAX_REFINEMENTS', 'MAX_PLAN_CONTINUATIONS'].includes(key)) invalid({ ...configured(), [`VITE_AGENTICA_${key}`]: '0' });
    invalid({ [`VITE_AGENTICA_${key}`]: '8' });
  });
  it('refuses output larger than the configured context using provider validation', () => {
    invalid({ ...configured(), VITE_AGENTICA_CONTEXT_WINDOW_TOKENS: '128' });
    invalid({ ...configured(), VITE_AGENTICA_MAX_OUTPUT_TOKENS: '8193' });
  });
  it.each(['ws://localhost:5079/api/host', 'ws://127.0.0.1/api/host', 'ws://[::1]:5079/api/host',
    'wss://localhost/api/host', 'wss://service.example/api/host'])('accepts endpoint %s', endpoint => {
    expect(readGameAgenticaProfile({ ...configured(), VITE_AGENTICA_ENDPOINT: endpoint }).profile!.endpoint).toBe(endpoint);
  });
  it.each(['http://localhost/api/host', 'https://service.example/api/host', 'ws://service.example/api/host',
    'ws://localhost.evil/api/host', 'ws://0.0.0.0/api/host', 'ws://[::ffff:127.0.0.1]/api/host', '/api/host',
    'wss://user:secret@service.example/api/host', 'ws://@localhost/api/host', 'ws://localhost/api/host?token=secret',
    'ws://localhost/api/host?', 'ws://localhost/api/host#', 'ws://localhost/api/host#secret', 'ws://localhost/api/host/',
    'ws://localhost/other', 'ws://localhost/api/ho\nst', ' ws://localhost/api/host', 'ws:\\localhost\\api\\host',
    'ws:localhost/api/host', 'ws:/localhost/api/host', 'ws://localhost:65536/api/host',
    `wss://${'a'.repeat(500)}.example/api/host`])('rejects unsafe endpoint without echoing its value: %s', endpoint => {
    const error = invalid({ ...configured(), VITE_AGENTICA_ENDPOINT: endpoint });
    expect(error).toBe('VITE_AGENTICA_ENDPOINT requires ws/wss /api/host without credentials, query or fragment; ws must be loopback.');
    expect(error).not.toContain('secret');
  });
  it('rejects unknown public settings and never carries credentials into a profile', () => {
    invalid({ ...configured(), VITE_AGENTICA_API_KEY: 'secret' });
    invalid({ ...configured(), VITE_AGENTICA_MAX_STEP: '100' });
    const result = readGameAgenticaProfile({ ...configured(), OPENAI_API_KEY: 'secret', AGENTICA_ENDPOINT: 'private' });
    expect(result).toEqual({ profile: defaults }); expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('is inert and returns independent snapshots without mutating input', () => {
    const effects = vi.fn(() => { throw Error('configuration must be inert'); });
    for (const key of ['fetch', 'WebSocket', 'indexedDB', 'localStorage']) vi.stubGlobal(key, effects);
    const env = Object.freeze(configured()), first = readGameAgenticaProfile(env).profile!;
    first.provider.model = 'changed'; first.limits.maxSteps = 99;
    expect(readGameAgenticaProfile(env)).toEqual({ profile: defaults }); expect(env).toEqual(configured());
    expect(effects).not.toHaveBeenCalled();
  });
});
