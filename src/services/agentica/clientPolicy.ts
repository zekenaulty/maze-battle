import type { AgenticaAction, AgenticaActionRecord, AgenticaGameBinding, AgenticaObjective } from './contracts';
import { parseAgenticaCommand, validateAgenticaBinding } from './commands';
import { actionFingerprint, actionKey, canonicalJson, type AgenticaStarted } from './sdk/agentica-host.mjs';

export function fixtureUrl(input: string): string {
  const url = new URL(input);
  if (url.protocol !== 'ws:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || url.username || url.password || url.search || url.hash || url.pathname !== '/api/host') {
    throw new Error('Agentica fixture requires a loopback ws:// URL ending in /api/host.');
  }
  return url.href;
}

export function objectiveIdentity(scope: string, objective: AgenticaObjective): string {
  return `${scope}:${objective}`;
}

export function startedBinding(draft: AgenticaGameBinding, started: AgenticaStarted): AgenticaGameBinding {
  for (const key of ['hostId', 'sessionId', 'sessionEpoch', 'scopeId', 'perspectiveId', 'objectiveId'] as const) {
    if (started[key] !== draft[key]) throw new Error('Agentica service start binding mismatch.');
  }
  const binding = { ...structuredClone(draft), runId: started.runId, manifestHash: started.manifestHash };
  validateAgenticaBinding(binding);
  return binding;
}

export function keyIdentity(key: string): [string, string, string, string] {
  if (typeof key !== 'string' || key.length > 1024) throw new Error('Invalid Agentica action key.');
  const value: unknown = JSON.parse(key);
  if (!Array.isArray(value) || value.length !== 4 || value.some(item => typeof item !== 'string' || !item.trim() || item.length > 128)
    || canonicalJson(value) !== key) throw new Error('Invalid Agentica action key.');
  return value as [string, string, string, string];
}

export function checkRecord(key: string, record: AgenticaActionRecord, binding: AgenticaGameBinding): AgenticaAction {
  if (typeof record.fingerprint !== 'string' || record.fingerprint.length > 16_384) throw new Error('Invalid Agentica action fingerprint.');
  const action: AgenticaAction = JSON.parse(record.fingerprint);
  parseAgenticaCommand(action, binding);
  if (actionKey(action) !== key || actionFingerprint(action) !== record.fingerprint) throw new Error('Agentica action identity changed.');
  return action;
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
}
