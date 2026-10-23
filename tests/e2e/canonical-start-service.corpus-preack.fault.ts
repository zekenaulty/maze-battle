import type { HostOperationEvent } from '../../src/services/agentica/sdk/agentica-host.mjs';

export interface PreackFault {
  kind: 'progress' | 'transfer';
  actionId?: string;
  request?: { url: string; serializedBody: string; body: HostOperationEvent };
  accepted?: { status: number; body: unknown };
  held: boolean;
}
let evidence: PreackFault | undefined;
export const preackFault = () => structuredClone(evidence);

/** Hold one real transport call, never a domain command or a manufactured service reply. */
export function holdPreack(kind: PreackFault['kind'], actionId?: string) {
  if (evidence) {
    if (evidence.kind !== kind || evidence.actionId || !actionId) throw Error('One pre-ACK fault per page lifetime.');
    evidence.actionId = actionId; return;
  }
  const state: PreackFault = evidence = { kind, actionId, held: false }, original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as HostOperationEvent : undefined;
    if (!state.actionId || !url.endsWith('/api/operations/events') || body?.actionId !== state.actionId || body.kind !== kind
      || kind === 'progress' && !(typeof body.usage?.steps === 'number' && body.usage.steps > 0)) return original(input, init);
    globalThis.fetch = original;
    state.request = { url, serializedBody: init!.body as string, body };
    if (kind === 'transfer') {
      const response = await original(input, init);
      if (!response.ok) throw Error('Lost transfer ACK requires real service acceptance.');
      state.accepted = { status: response.status, body: await response.clone().json() };
    }
    state.held = true;
    // Reload destroys the pending caller. No ACK reaches the host and no timeout is fabricated.
    return new Promise<Response>(() => {});
  };
}
