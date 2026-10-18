import type { GameLaunchOptions } from '../services/agentica/game/launch';
import { launchProvider } from '../persistence/canonical/agentica/launch.wire';
import { integer } from '../persistence/canonical/validation';

type GameAgenticaProfile = Omit<GameLaunchOptions, 'objectiveId' | 'objective'>;
const prefix = 'VITE_AGENTICA_';
const numericSettings = {
  CONTEXT_WINDOW_TOKENS: [8192, 1], MAX_OUTPUT_TOKENS: [256, 1], MAX_STEPS: [8, 1],
  MAX_REFINEMENTS: [6, 0], MAX_PLAN_CONTINUATIONS: [0, 0], TIMEOUT_SECONDS: [120, 1], ACTION_TIMEOUT_SECONDS: [15, 1],
} as const;
const settings = new Set(['ENDPOINT', 'PROVIDER', 'MODEL', 'THINKING_EFFORT', ...Object.keys(numericSettings)].map(key => prefix + key));

function text(env: Record<string, unknown>, name: string): string {
  const value = env[prefix + name];
  if (typeof value !== 'string' || value.trim().length === 0) throw Error(`${prefix + name} requires a nonempty string.`);
  return value;
}
function number(env: Record<string, unknown>, name: keyof typeof numericSettings): number {
  const value = env[prefix + name], [fallback, min] = numericSettings[name];
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value.trim()) || !integer(Number(value), min)) {
    throw Error(`${prefix + name} requires a safe integer of at least ${min}.`);
  }
  return Number(value);
}
function endpoint(input: string): string {
  // URL parsing normalizes empty credentials/query/fragment and embedded whitespace; reject those before parsing.
  const invalid = 'VITE_AGENTICA_ENDPOINT requires ws/wss /api/host without credentials, query or fragment; ws must be loopback.';
  if (input.length > 512 || !/^wss?:\/\//.test(input) || /[\s@?#\\]/.test(input)) throw Error(invalid);
  let url: URL;
  try { url = new URL(input); } catch { throw Error(invalid); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/api/host'
    || !(url.protocol === 'wss:' || url.protocol === 'ws:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw Error(invalid);
  }
  return url.href;
}

/** Public build-time values only. Reading configuration never admits a run or touches a service or database. */
export function readGameAgenticaProfile(env: Record<string, unknown>): { profile?: GameAgenticaProfile; error?: string } {
  try {
    const configured = Object.keys(env).filter(key => key.startsWith(prefix) && env[key] !== undefined);
    if (!configured.length) return {};
    if (configured.some(key => !settings.has(key))) throw Error('Unrecognized public Agentica setting.');
    const address = endpoint(text(env, 'ENDPOINT')), provider = text(env, 'PROVIDER'), model = text(env, 'MODEL');
    const thinkingEffort = env.VITE_AGENTICA_THINKING_EFFORT === undefined ? {} : { thinkingEffort: text(env, 'THINKING_EFFORT') };
    return { profile: { endpoint: address,
      provider: launchProvider({ provider, model, ...thinkingEffort,
        contextWindowTokens: number(env, 'CONTEXT_WINDOW_TOKENS'), maxOutputTokens: number(env, 'MAX_OUTPUT_TOKENS') }),
      limits: { maxSteps: number(env, 'MAX_STEPS'), maxRefinements: number(env, 'MAX_REFINEMENTS'),
        maxPlanContinuations: number(env, 'MAX_PLAN_CONTINUATIONS'), timeoutSeconds: number(env, 'TIMEOUT_SECONDS'),
        actionTimeoutSeconds: number(env, 'ACTION_TIMEOUT_SECONDS') } } };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Invalid public Agentica configuration.' };
  }
}
