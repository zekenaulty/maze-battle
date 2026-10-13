import type { AgenticaAction } from '../contracts';
import type { CanonicalHostPort } from '../../game/CanonicalHostCommand';
import { readCanonical, snapshotOf } from '../../../persistence/canonical/read';
import { executeCanonical } from '../../../persistence/canonical/transaction';
import { navigationActionHooks, retainActionResult } from '../../../persistence/canonical/agentica/actions';
import { readPublication } from '../../../persistence/canonical/agentica/publication';
import type { PreparedAction } from '../../../persistence/canonical/agentica/types';
import { gameCheckpoint } from '../../../persistence/canonical/game/checkpoint';
import { readKnownCells } from '../../../persistence/canonical/knowledge/queries';
import { createDestinationBinding, executeNavigationCommand } from '../../../persistence/canonical/navigation/commands';
import { destinationPosition } from '../../../persistence/canonical/navigation/validation';
import { fields } from '../../../persistence/canonical/roster/codec';
import { MIN_TERMINAL_BYTES } from '../../../persistence/canonical/types';
import { check } from '../../../persistence/canonical/validation';
import { json } from '../../../persistence/canonical/world/records';
import { actionGrant, actionResult, pinDeadline, type ActionBinding } from './actionContract';
import { observeMaze, inspectMaze } from './observation';
import { cursorAfter, inspectArgs, inspectQuery, localPosition } from './validation';

function parse(action: AgenticaAction) {
  if (action.capabilityId === 'maze.observe') { fields(action.arguments, ''); return { kind: 'observe' as const }; }
  if (action.capabilityId === 'maze.inspect') return { kind: 'inspect' as const, args: inspectArgs(action.arguments) };
  check(action.capabilityId === 'maze.navigate', 'unsupported capability');
  const args = fields(action.arguments, 'level spaceId row column');
  const target = localPosition(args as unknown as Parameters<typeof localPosition>[0]); destinationPosition(target);
  return { kind: 'navigate' as const, target };
}

/** One reserved action only. The transport controls continuation after admission, not this dispatcher. */
export async function executeGameAction(port: CanonicalHostPort, binding: ActionBinding, identity: PreparedAction) {
  let command: ReturnType<typeof parse> | undefined;
  try { command = parse(identity.action); } catch { /* Invalid arguments produce an explicit, non-effect refusal. */ }
  let refusal = command ? undefined : 'Invalid arguments for this capability.';
  if (command?.kind === 'navigate') {
    const target = command.target;
    const known = await readCanonical(async pages => {
      const publication = await readPublication(pages, binding.publication), c = gameCheckpoint(publication.snapshot.checkpoint);
      // Final grant validation rejects a changed publication before any admission.
      const [cell] = await readKnownCells(pages, c, [target]);
      return c.mode !== 'town' && c.position.level === target.level && cell.state !== 'unknown';
    });
    if (!known.value) refusal = 'Destination is not an earned address on the current dungeon floor.';
  }
  if (command?.kind === 'navigate' && !refusal) {
    const target = command.target, operationId = `travel-${identity.storageKey.slice(-64)}`;
    const hooks = navigationActionHooks(identity, async view => {
      const earned = await observeMaze({ ...view.knowledge, savedSnapshot: view.savedSnapshot, sourceReceipt: view.sourceReceipt },
        snapshotOf(view.head), binding.publication);
      const afterRevision = view.head.revision + 1;
      return { ...actionResult(identity, { ...earned, revision: afterRevision, data: { ...earned.data,
        revisionContext: { kind: 'navigation-admission', publicationRevision: earned.revision, commitRevision: afterRevision } } },
      'Destination admitted. Movement awaits service custody confirmation.'), operation: { operationId, summary: 'Navigate to the chosen earned destination.' } };
    });
    return port.submitHostCommand({ kind: 'fresh', operation: 'operation.admit',
      input: { operationId, binding: json(createDestinationBinding(target)), terminalBytes: MIN_TERMINAL_BYTES },
      execute: (input, options) => executeNavigationCommand(pinDeadline(input, identity.action), { ...options, host: {
        async prepare(view) {
          await actionGrant({ head: view.head, pages: { get: (_area, key) => view.getExecution(key),
            savedSnapshot: view.savedSnapshot, sourceReceipt: view.sourceReceipt }, liveOperation: view.liveOperation }, binding, identity.action);
          await hooks.prepare(view);
        }, commit: hooks.commit,
      } }) });
  }
  const selected = command, message = refusal;
  return port.submitHostCommand({ kind: 'fresh', operation: 'agentica.action.resolve', input: { action: identity.storageKey },
    execute: (input, options) => {
      const request = pinDeadline(input, identity.action);
      return executeCanonical(request, async tx => {
        await actionGrant(tx, binding, identity.action);
        let rejected = message;
        if (selected?.kind === 'inspect') {
          try { cursorAfter(selected.args.cursor, binding.publication, inspectQuery(selected.args, gameCheckpoint(tx.head.checkpoint))); }
          catch { rejected = 'Inspection cursor or query does not belong to this publication.'; }
        }
        const observation = !rejected && selected?.kind === 'inspect'
          ? await inspectMaze(tx.pages, snapshotOf(tx.head), binding.publication, selected.args)
          : await observeMaze(tx.pages, snapshotOf(tx.head), binding.publication);
        const result = actionResult(identity, observation, rejected ?? 'Earned observation returned without refreshing sight.', rejected ? 'refused' : 'applied');
        return (await retainActionResult(tx, request, identity, result)).receipt;
      }, options);
    } });
}
