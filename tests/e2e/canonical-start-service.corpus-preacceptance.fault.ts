import type { AgenticaMessage } from '../../src/services/agentica/sdk/agentica-host.mjs';

export interface PreacceptanceFault {
  kind: 'progress' | 'completion';
  attempts: { serialized: string; payload: unknown; url?: string }[];
}
let evidence: PreacceptanceFault | undefined;
export const preacceptanceFault = () => structuredClone(evidence);

/** No fabricated response or acceptance: reload abandons the held caller. */
export function holdProgressBeforeDispatch(actionId: string) {
  if (evidence) throw Error('Preacceptance fault already installed.');
  const state: PreacceptanceFault = evidence = { kind: 'progress', attempts: [] };
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const payload = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    if (!url.endsWith('/api/operations/events') || payload?.actionId !== actionId || payload?.sequence !== 2)
      return original(input, init);
    state.attempts.push({ url, serialized: String(init!.body), payload });
    return new Promise<Response>(() => {});
  };
}

/** Captures every SDK send attempt, but never passes completion to the native socket. */
export function holdCompletionBeforeDispatch() {
  if (evidence) throw Error('Preacceptance fault already installed.');
  const state: PreacceptanceFault = evidence = { kind: 'completion', attempts: [] };
  const NativeSocket = globalThis.WebSocket;
  globalThis.WebSocket = class extends NativeSocket {
    override send(data: string | BufferSource | Blob) {
      if (typeof data === 'string') {
        const frame: AgenticaMessage = JSON.parse(data);
        if (frame.type === 'action.result' && frame.payload.completion) {
          state.attempts.push({ serialized: data, payload: frame });
          return;
        }
      }
      super.send(data);
    }
  };
}
