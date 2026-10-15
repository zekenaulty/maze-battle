import type { GameSession } from '../../src/services/game/GameSession';
import { prepareAction } from '../../src/persistence/canonical/agentica/actions';
import { readAgenticaOperation, retainOperationConfirmation, retainOperationCustodyAck, operationProgressHooks,
  retainEventAcknowledgement } from '../../src/persistence/canonical/agentica/operation';
import { operationSettlementHooks } from '../../src/persistence/canonical/agentica/terminal.settle';
import { executeNavigationCommand } from '../../src/persistence/canonical/navigation/commands';
import { executeCanonical } from '../../src/persistence/canonical/transaction';
import { json } from '../../src/persistence/canonical/world/records';
import type { TransferSeed } from './canonical-operation-transfer.setup';

// Synthetic service evidence only. No SDK, HTTP route, socket, or service is invoked.
export async function confirmNavigation(session: GameSession, seed: TransferSeed) {
  const identity = await prepareAction(seed.action), binding = seed.binding, entry = structuredClone(seed.entry);
  await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.operation.confirm',
    input: json({ action: identity.storageKey, binding, entry }), execute: (r, options) => executeCanonical(r,
      async tx => (await retainOperationConfirmation(tx, r, identity, binding, entry)).receipt, options) });
  const confirmation = (await readAgenticaOperation(identity)).value!.confirmation;
  entry.latestEvent = confirmation.data.probe;
  await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.operation.custody',
    input: json({ action: identity.storageKey, confirmation: confirmation.reference, entry }), execute: (r, options) => executeCanonical(r,
      async tx => (await retainOperationCustodyAck(tx, r, identity, confirmation.reference, entry)).receipt, options) });
}
export async function advanceNavigation(session: GameSession, seed: TransferSeed) {
  const identity = await prepareAction(seed.action), before = (await readAgenticaOperation(identity)).value!;
  await session.submitHostCommand({ kind: 'fresh', operation: 'navigation.advance',
    input: { operationId: seed.operationId, sequence: before.progress.sequence },
    execute: (r, options) => executeNavigationCommand(r, { ...options, host: operationProgressHooks(identity, before.confirmation.reference) }) });
  const after = (await readAgenticaOperation(identity)).value!, event = after.event!;
  const entry = { ...structuredClone(seed.entry), latestEvent: event.data.event };
  await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.operation.ack',
    input: json({ action: identity.storageKey, event: event.reference, entry }), execute: (r, options) => executeCanonical(r,
      async tx => (await retainEventAcknowledgement(tx, r, identity, event.reference, entry)).receipt, options) });
  return after.progress;
}
export async function settleNavigation(session: GameSession, seed: TransferSeed) {
  const identity = await prepareAction(seed.action);
  return session.submitHostCommand({ kind: 'fresh', operation: 'operation.settle',
    input: { operationId: seed.operationId, disposition: 'completed' },
    execute: (r, options) => executeNavigationCommand(r, { ...options, host: operationSettlementHooks(identity, seed.binding) }) });
}
