import type { AgenticaAction } from '../contracts';
import type { AgenticaHost } from '../sdk/agentica-host.mjs';
import type { CanonicalHostPort } from '../../game/CanonicalHostCommand';
import { readCanonical } from '../../../persistence/canonical/read';
import { canonicalFence, executeCanonical, operateCanonical } from '../../../persistence/canonical/transaction';
import { check, sameFence } from '../../../persistence/canonical/validation';
import { json } from '../../../persistence/canonical/world/records';
import { prepareAction } from '../../../persistence/canonical/agentica/actions';
import { loadOperationConfirmation } from '../../../persistence/canonical/agentica/operation.confirmation';
import { loadTransfer, loadTransferAck, transferStageKey } from '../../../persistence/canonical/agentica/transfer.records';
import { loadTransferAdoption, transferAdoptionId } from '../../../persistence/canonical/agentica/transfer.adoption';
import { retainTransferIntent, retainTransferAck, retainTransferAuthority } from '../../../persistence/canonical/agentica/transfer';
import { assertEffectiveOperationCustody } from '../../../persistence/canonical/agentica/authority';
import { equivalentOperationWire, operationEntry, validateOperationEntry } from '../../../persistence/canonical/agentica/operation.wire';
import { equal, snapshotReference } from '../../../persistence/canonical/agentica/validation';
import type { ProtocolRef } from '../../../persistence/canonical/agentica/types';
import { captureBinding, type ActionBinding } from './actionContract';
import { claimTransportAttachment, transportGate } from './transportGate';
import { boundedGameFetch } from './network';

/** Explicit unfinished-navigation takeover only. No connection, start, wake, provider or action grant. */
export async function createGameOperationTransfer(port: CanonicalHostPort, sdk: Pick<AgenticaHost, 'listOperations' | 'signalOperation'>,
  input: AgenticaAction, inputBinding: ActionBinding, fetchImpl: typeof fetch = fetch) {
  const identity = await prepareAction(input), binding = captureBinding(inputBinding), gate = transportGate(port);
  const release = claimTransportAttachment(`transfer:${identity.storageKey}`), network = boundedGameFetch(gate.signal, fetchImpl);
  gate.signal.addEventListener('abort', release, { once: true });
  if (gate.signal.aborted) { release(); gate.signal.throwIfAborted(); }
  let busy = false;
  const state = () => readCanonical(async pages => {
    const confirmed = await loadOperationConfirmation(pages, identity); check(confirmed, 'transfer needs original service confirmation');
    check(equal(confirmed.data.binding, binding), 'transfer original binding changed');
    const transfer = await loadTransfer(pages, identity, confirmed);
    const ack = transfer && await loadTransferAck(pages, identity, confirmed, transfer);
    return { confirmed, transfer, ack };
  });
  async function exclusive<T>(work: () => Promise<T>) {
    check(!busy, 'transfer already in flight'); gate.signal.throwIfAborted(); busy = true;
    try { return await work(); } finally { busy = false; }
  }
  async function prepare(inputPublication: ProtocolRef) {
    const publication = snapshotReference(inputPublication);
    return exclusive(async () => {
      await gate.port.submitHostCommand({ kind: 'fresh', operation: 'agentica.operation.transfer', input: json({ action: identity.storageKey, publication }),
        execute: (request, options) => executeCanonical(request, async tx => (await retainTransferIntent(tx, request, identity, publication)).receipt, options) });
      return (await state()).value.transfer!.reference;
    });
  }
  async function pulse() {
    return exclusive(async () => {
      const view = await state(); gate.signal.throwIfAborted();
      const { confirmed, transfer, ack } = view.value, { bound } = confirmed;
      check(transfer, 'prepare an explicit transfer first');
      check(view.head.status === 'ready' && bound.operation.state === 'admitted' && bound.launch.guard.state === 'admitted'
        && bound.progress.status === 'running', 'terminal navigation cannot transfer');
      const intent = transfer.reference;
      if (!ack) {
        const event = transfer.data.event, entries = await sdk.listOperations({ hostId: event.hostId, sessionId: event.sessionId, fetchImpl: network });
        gate.signal.throwIfAborted();
        const matches = entries.filter(e => e.action.runId === identity.action.runId && e.action.actionId === identity.action.actionId);
        check(matches.length === 1, 'missing or ambiguous transfer service custody');
        const entry = operationEntry(matches[0]);
        check(entry.latestEvent && (equivalentOperationWire(entry.latestEvent, event, 'event')
          || equivalentOperationWire(entry.latestEvent, transfer.data.previous, 'event')), 'service transfer predecessor changed');
        const epoch = equivalentOperationWire(entry.latestEvent, event, 'event') ? event.nextSessionEpoch! : event.sessionEpoch;
        validateOperationEntry(entry, bound.launch.acceptedStart, identity.action, bound.result, epoch);
        check(equal(entry.usage, confirmed.data.entry.usage), 'transfer usage changed');
        const remote = await sdk.signalOperation(structuredClone(event), { fetchImpl: network }); gate.signal.throwIfAborted();
        await gate.port.submitHostCommand({ kind: 'fresh', operation: 'agentica.operation.transfer-ack', input: json({ action: identity.storageKey, intent, entry: remote }),
          execute: (request, options) => executeCanonical(request, async tx => (await retainTransferAck(tx, request, identity, intent, remote)).receipt, options) });
        return { status: 'transfer-acknowledged' as const };
      }
      if (transfer.source.expected.owner !== view.head.owner || transfer.source.expected.epoch !== view.head.epoch)
        return { status: 'takeover-required' as const };
      for (const [kind, target] of [['guard', bound.launch.guard], ['navigation', bound.operation]] as const) {
        if (target.owner === view.head.owner && target.epoch === view.head.epoch) {
          await readCanonical(async p => {
            const original = await loadTransferAdoption(p, confirmed, transfer, ack.row.revision, kind);
            check(original.receipt.afterRevision === target.revision, 'kernel adoption was not this explicit transfer');
          });
          continue;
        }
        await gate.port.submitHostCommand({ kind: 'retry', request: { attemptId: transferAdoptionId(transfer, kind),
          operation: 'operation.adopt', input: { operationId: target.id }, expected: canonicalFence(view.head), deadlineAt: null },
          execute: async (request, options) => {
            const fresh = await state();
            check(sameFence(request.expected, canonicalFence(fresh.head)) && fresh.value.ack
              && equal(fresh.value.transfer?.reference, intent) && fresh.head.owner === transfer.source.expected.owner
              && fresh.head.epoch === transfer.source.expected.epoch, 'kernel transfer adoption changed');
            return operateCanonical(request, 'adopt', undefined, options);
          } });
        return { status: 'kernel-adopted' as const, kind };
      }
      const key = transferStageKey(intent, 'authority');
      const existing = await readCanonical(p => p.get('execution', key)); gate.signal.throwIfAborted();
      if (!existing.value) await gate.port.submitHostCommand({ kind: 'fresh', operation: 'agentica.operation.transfer-authorize', input: json({ action: identity.storageKey, intent }),
        execute: (request, options) => executeCanonical(request, async tx => (await retainTransferAuthority(tx, request, identity, intent)).receipt, options) });
      const fresh = await state();
      await readCanonical(async (p, snapshot) => { check(snapshot.revision === fresh.head.revision, 'transfer authority changed');
        const c = await loadOperationConfirmation(p, identity); check(c, 'missing transfer confirmation');
        await assertEffectiveOperationCustody(p, fresh.head, identity, c); });
      gate.signal.throwIfAborted(); return { status: 'navigation-authorized' as const };
    });
  }
  return { prepare, pulse, close() { gate.close(); release(); } };
}
