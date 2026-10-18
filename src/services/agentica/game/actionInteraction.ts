import type { CanonicalHostPort } from '../../game/CanonicalHostCommand';
import { operationActionHooks } from '../../../persistence/canonical/agentica/actions.operation';
import type { PreparedAction } from '../../../persistence/canonical/agentica/types';
import { equal } from '../../../persistence/canonical/agentica/validation';
import { createInteractionBinding, executeInteractionCommand } from '../../../persistence/canonical/interaction/commands';
import type { InteractionProgress } from '../../../persistence/canonical/interaction/types';
import { readCanonical, snapshotOf } from '../../../persistence/canonical/read';
import { MIN_TERMINAL_BYTES } from '../../../persistence/canonical/types';
import { check } from '../../../persistence/canonical/validation';
import { json } from '../../../persistence/canonical/world/records';
import { actionGrant, actionResult, pinDeadline, type ActionBinding } from './actionContract';
import { resolveChestSelection, type ChestSelection } from './chestSelection';
import { observeMaze } from './observation';

export async function selectedChest(binding: ActionBinding, selection: ChestSelection) {
  return (await readCanonical((pages, snapshot) => resolveChestSelection(pages, snapshot, binding.publication, selection))).value;
}

/** Admit one explicit choice, never loot as part of navigation or before service custody. */
export function admitChest(port: CanonicalHostPort, binding: ActionBinding, identity: PreparedAction,
  selection: ChestSelection, selected: NonNullable<Awaited<ReturnType<typeof selectedChest>>>) {
  const interaction = createInteractionBinding(selected.command, selected.position);
  const operationId = `interact-${identity.storageKey.slice(-64)}`;
  const hooks = operationActionHooks<InteractionProgress>(identity, 'interaction', async view => {
    const earned = await observeMaze({ ...view.knowledge, savedSnapshot: view.savedSnapshot, sourceReceipt: view.sourceReceipt },
      snapshotOf(view.head), binding.publication);
    const afterRevision = view.head.revision + 1;
    return { ...actionResult(identity, { ...earned, revision: afterRevision, data: { ...earned.data,
      revisionContext: { kind: 'interaction-admission', publicationRevision: earned.revision, commitRevision: afterRevision } } },
    'Chest interaction admitted. Opening awaits service custody confirmation.'),
    operation: { operationId, summary: 'Open the explicitly selected current-tile chest once, without moving.' } };
  });
  return port.submitHostCommand({ kind: 'fresh', operation: 'operation.admit',
    input: { operationId, binding: json(interaction), terminalBytes: MIN_TERMINAL_BYTES, ackPolicy: 'verified-host' },
    execute: (input, options) => executeInteractionCommand(pinDeadline(input, identity.action), { ...options, host: {
      async prepare(view) {
        await actionGrant({ head: view.head, pages: { get: (_area, key) => view.getExecution(key),
          savedSnapshot: view.savedSnapshot, sourceReceipt: view.sourceReceipt }, liveOperation: view.liveOperation }, binding, identity.action);
        const current = await resolveChestSelection({ ...view.knowledge, savedSnapshot: view.savedSnapshot, sourceReceipt: view.sourceReceipt },
          snapshotOf(view.head), binding.publication, selection);
        check(current && equal(current, selected), 'chest selection changed before admission');
        await hooks.prepare(view);
      }, commit: hooks.commit,
    } }) });
}
