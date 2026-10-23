import type { AgenticaMessage } from '../../src/services/agentica/sdk/agentica-host.mjs';

export interface DeliveryFault {
  kind: 'progress' | 'completion';
  sent: unknown[];
  withheld: unknown[];
}
let evidence: DeliveryFault | undefined;
export const deliveryFault = () => structuredClone(evidence);

/** Test-only transport boundary. The original HTTP request reaches the real service once. */
export function loseProgressReply(actionId: string) {
  if (evidence) throw Error('Delivery fault already installed.');
  const state: DeliveryFault = evidence = { kind: 'progress', sent: [], withheld: [] };
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    if (!url.endsWith('/api/operations/events') || body?.actionId !== actionId || body?.sequence !== 2)
      return original(input, init);
    globalThis.fetch = original;
    state.sent.push({ url, serializedBody: init!.body, body });
    const response = await original(input, init);
    if (!response.ok) throw Error('Fault boundary requires real service acceptance.');
    state.withheld.push({ status: response.status, body: await response.clone().json() });
    throw Error('Fixture discarded the real accepted interaction progress reply.');
  };
}

/** Withhold only real confirmation frames for the one retained host completion result. */
export function loseCompletionConfirmation() {
  if (evidence) throw Error('Delivery fault already installed.');
  const state: DeliveryFault = evidence = { kind: 'completion', sent: [], withheld: [] };
  const NativeSocket = globalThis.WebSocket;
  globalThis.WebSocket = class extends NativeSocket {
    private completionRun?: string;
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      this.addEventListener('message', event => {
        const frame: AgenticaMessage = JSON.parse(String(event.data));
        if (!this.completionRun || frame.runId !== this.completionRun || !['action.accepted', 'outcome'].includes(frame.type)) return;
        event.stopImmediatePropagation();
        state.withheld.push(frame);
        if (frame.type === 'outcome') this.close(1000, 'Fixture withheld completion confirmation');
      });
    }
    override send(data: string | BufferSource | Blob) {
      if (typeof data === 'string') {
        const frame: AgenticaMessage = JSON.parse(data);
        if (frame.type === 'action.result' && frame.payload.completion) {
          if (state.sent.length) throw Error('Duplicate completion crossed the fault boundary.');
          this.completionRun = frame.runId;
          state.sent.push(frame);
        }
      }
      super.send(data);
    }
  };
}
