import type { AgenticaAction } from '../../src/services/agentica/contracts';
import type { CanonicalHostPort } from '../../src/services/game/CanonicalHostCommand';
import { recoverPregrantAction } from '../../src/services/agentica/game/pendingRecovery';
import { createGameActionHooks } from '../../src/services/agentica/game/actionHooks';
import { CANONICAL_DATABASE } from '../../src/persistence/canonical/database';
import type { DecisionAttachment } from './canonical-start-service.decision-control';

let lostReply: { serializedBody: string; status: number; reply: unknown } | undefined;
let transactions: string[] = [];
export const readLostPendingReply = () => structuredClone(lostReply ?? null);
export const readPendingRecoveryTransactions = () => [...transactions];

async function observeTransactions<T>(work: () => Promise<T>) {
  const original = IDBDatabase.prototype.transaction;
  transactions = [];
  IDBDatabase.prototype.transaction = function (stores, mode, options) {
    if (this.name === CANONICAL_DATABASE) transactions.push(mode ?? 'readonly');
    return original.call(this, stores, mode, options);
  };
  try { return await work(); }
  finally { IDBDatabase.prototype.transaction = original; }
}

/** Explicit hook invocation: the pregrant channel itself does not deliver an action to these hooks. */
export async function producePendingInterim(port: CanonicalHostPort, source: DecisionAttachment, action: AgenticaAction) {
  const hostCommands: string[] = [];
  const hooks = createGameActionHooks({ hostSignal: port.hostSignal, submitHostCommand(command) {
    hostCommands.push(command.kind); return port.submitHostCommand(command);
  } }, source.binding);
  const result = await observeTransactions(() => hooks.onAction!(action));
  return { result, hostCommands, transactions: [...transactions] };
}

/** Fault injection observes a real accepted HTTP response, then loses it before production code receives it. */
export async function recoverPendingNoEffect(port: Pick<CanonicalHostPort, 'hostSignal'>,
  source: DecisionAttachment, action: AgenticaAction, loseReply = false) {
  const fetchImpl: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    if (loseReply && init?.method === 'POST' && response.ok) {
      if (typeof init.body !== 'string') throw Error('Expected production serialized recovery envelope');
      lostReply = { serializedBody: init.body, status: response.status, reply: await response.clone().json() };
      throw Error('Fixture discarded the real successful pending-recovery reply.');
    }
    return response;
  };
  return observeTransactions(() => recoverPregrantAction(port, source.action(), source.binding, action, { fetchImpl }));
}

/** Submit a production hook result, exact captured replay or explicit negative; never supply a service response. */
export async function postPendingRecovery(serializedBody: string) {
  const response = await fetch('http://127.0.0.1:5259/api/recovery', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: serializedBody });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}
