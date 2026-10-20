import { vi } from 'vitest';
import { AgenticaHost, actionFingerprint, actionKey, type AgenticaHostOptions, type AgenticaMessage } from '../sdk/agentica-host.mjs';
import type { AgenticaAction, AgenticaActionRecord, AgenticaResult } from '../contracts';
import { protocolResult } from '../../../persistence/canonical/agentica/types.test-support';

/** Real SDK queue, persistence and result validation; only canonical storage and the socket are fakes. */
export function completionStore(action: AgenticaAction, completed: AgenticaResult) {
  const records = new Map<string, AgenticaActionRecord>(), effect = vi.fn();
  const load = vi.fn(async (key: string) => structuredClone(records.get(key) ?? null));
  const save = vi.fn(async (key: string, record: AgenticaActionRecord) => { records.set(key, structuredClone(record)); });
  const execute = vi.fn(async (input: AgenticaAction) => {
    const result = actionFingerprint(input) === actionFingerprint(action) ? completed
      : { ...protocolResult(input), operation: { operationId: 'unexpected-operation', summary: 'Unexpected admission.' } };
    if (result.operation) effect();
    records.set(actionKey(input), { fingerprint: actionFingerprint(input), status: 'completed', result: structuredClone(result) });
    return structuredClone(result);
  });
  const reconcile = vi.fn(async (input: AgenticaAction) => {
    const row = await load(actionKey(input));
    return row?.fingerprint === actionFingerprint(input) ? row.result ?? null : null;
  });
  return { records, effect, load, save, execute, reconcile };
}

export function completionSdk(options: AgenticaHostOptions, action: AgenticaAction, objectiveId: string) {
  const sdk = new AgenticaHost(options), frames: AgenticaMessage[] = [];
  const internal = sdk as unknown as {
    socket: { readyState: number; send(text: string): void; close(): void };
    runs: Map<string, unknown>; actionQueue: Promise<void>; _receive(text: string): void;
  };
  const close = vi.fn(() => { internal.socket.readyState = 3; options.onStatus?.({ state: 'disconnected' }); });
  internal.socket = { readyState: 1, close, send: text => { frames.push(JSON.parse(text)); } };
  internal.runs.set(action.runId, { sessionId: action.sessionId, sessionEpoch: action.sessionEpoch, objectiveId });
  sdk.connect = vi.fn(async () => {});
  const notice = (type: string, payload: object = {}) =>
    internal._receive(JSON.stringify({ protocolVersion: 1, type, runId: action.runId, payload }));
  return { sdk, frames, close, notice, protocolError: () => internal._receive('{'),
    async deliver(input: AgenticaAction, type = 'action.request') {
      internal._receive(JSON.stringify({ protocolVersion: 1, type, runId: input.runId, payload: input }));
      await internal.actionQueue;
    },
  };
}
