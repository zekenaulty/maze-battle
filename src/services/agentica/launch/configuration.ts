import type { AgenticaStart } from '../contracts';
import { fixtureUrl } from '../clientPolicy';

export interface LaunchConfiguration { url: string; provider: 'fixture' | 'openai'; model: string; thinkingEffort: string }
export const DEFAULT_LAUNCH: LaunchConfiguration = {
  url: 'ws://127.0.0.1:5078/api/host', provider: 'openai', model: 'gpt-6-luna', thinkingEffort: 'high',
};
// Local travel windows are configured independently in config/directedTravel.ts.
export const LAUNCH_LIMITS: AgenticaStart['limits'] = {
  maxSteps: 8, maxRefinements: 2, maxPlanContinuations: 2, timeoutSeconds: 180, actionTimeoutSeconds: 45,
};
export function launchProvider(config: LaunchConfiguration): AgenticaStart['provider'] {
  fixtureUrl(config.url);
  if (!['fixture', 'openai'].includes(config.provider)) throw new Error('Unsupported launch provider.');
  if (!config.model.trim() || config.model.length > 200) throw new Error('A model name is required.');
  if (!['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(config.thinkingEffort)) throw new Error('Invalid reasoning effort.');
  return { provider: config.provider, model: config.provider === 'fixture' ? 'fixture-model' : config.model.trim(),
    ...(config.provider === 'openai' ? { thinkingEffort: config.thinkingEffort } : {}),
    includeThoughtSummaries: false, contextWindowTokens: 131072, maxOutputTokens: 4096 };
}
export function labHttpUrl(socket: string, path: string) {
  const url = new URL(fixtureUrl(socket)); url.protocol = 'http:'; url.pathname = path; return url.href;
}
export async function readLabJson(socket: string, path: string): Promise<unknown> {
  const response = await fetch(labHttpUrl(socket, path), { signal: AbortSignal.timeout(8000), cache: 'no-store' });
  if (!response.ok) throw new Error(`Lab returned HTTP ${response.status}.`);
  return response.json();
}
export async function checkLab(config: LaunchConfiguration) {
  launchProvider(config);
  const health = await readLabJson(config.url, '/api/health') as { status?: string; protocolVersion?: number };
  if (health.status !== 'ready' || health.protocolVersion !== 1) throw new Error('Lab protocol is not ready.');
  if (config.provider === 'fixture') return { message: 'Fixture host ready', model: config.model, thinkingEffort: config.thinkingEffort };
  const metadata = await readLabJson(config.url, '/api/providers/openai/settings') as {
    configured?: boolean; model?: string; thinkingEffort?: string;
  };
  if (metadata.configured !== true) throw new Error('Configure the OpenAI credential in Lab before starting.');
  return { message: 'Lab credential configured; provider access not yet tested', model: metadata.model, thinkingEffort: metadata.thinkingEffort };
}
