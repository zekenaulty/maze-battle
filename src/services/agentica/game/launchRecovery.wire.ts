import type { HostStartKey } from '../sdk/agentica-host.mjs';

/** Exact durable attempt lookup only. A missing attempt is UNKNOWN, never permission to restart. */
export function startRecoveryUrl(endpoint: string, key?: HostStartKey) {
  const url = new URL(endpoint);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = key ? '/api/starts' : '/api/starts/stop'; url.search = ''; url.hash = '';
  if (key) for (const name of ['hostId', 'sessionId', 'attemptId'] as const) url.searchParams.set(name, key[name]);
  return url.href;
}
