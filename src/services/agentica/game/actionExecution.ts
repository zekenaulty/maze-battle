import type { AgenticaAction } from '../contracts';
import type { CanonicalHostPort } from '../../game/CanonicalHostCommand';
import { readCanonical, snapshotOf } from '../../../persistence/canonical/read';
import { executeCanonical } from '../../../persistence/canonical/transaction';
import { navigationActionHooks, retainActionResult } from '../../../persistence/canonical/agentica/actions';
import { readPublication } from '../../../persistence/canonical/agentica/publication';
import type { PreparedAction, ProtocolRef } from '../../../persistence/canonical/agentica/types';
import { gameCheckpoint } from '../../../persistence/canonical/game/checkpoint';
import { readKnownCells } from '../../../persistence/canonical/knowledge/queries';
import { isCurrentFrontier } from '../../../persistence/canonical/knowledge/frontiers';
import { createDestinationBinding, createFrontierBinding, createExplorationBinding, executeNavigationCommand } from '../../../persistence/canonical/navigation/commands';
import { destinationPosition } from '../../../persistence/canonical/navigation/validation';
import { fields } from '../../../persistence/canonical/roster/codec';
import { MIN_TERMINAL_BYTES } from '../../../persistence/canonical/types';
import { check } from '../../../persistence/canonical/validation';
import { json } from '../../../persistence/canonical/world/records';
import { actionGrant, actionResult, captureBinding, pinDeadline, type ActionBinding } from './actionContract';
import { admitChest, selectedChest } from './actionInteraction';
import { chestArgs } from './chestSelection';
import { exploreArgs } from './exploreArgs';
import { observeMaze, inspectMaze } from './observation';
import { cursorAfter, inspectArgs, inspectQuery, localPosition } from './validation';
import { questArgs } from '../../../persistence/canonical/agentica/quest.proof';
import { queryQuests } from './questContext';
import { QuestQueryRefusal } from './questSelection';
import { ObjectiveRefusal } from '../../../persistence/canonical/agentica/objective.prepare';
import { queryObjective } from './objectiveContext';
import { queryDecision } from '../../../persistence/canonical/agentica/decision.query.prepare';
import { decisionPages, DecisionQueryRefusal } from '../../../persistence/canonical/agentica/decision.query.read';
import { snapshotPrepared } from '../../../persistence/canonical/agentica/validation';
import { launchPages } from '../../../persistence/canonical/agentica/launch.records';

function parse(action: AgenticaAction, publication: ProtocolRef) {
  if (action.capabilityId === 'maze.observe') { fields(action.arguments, ''); return { kind: 'observe' as const }; }
  if (action.capabilityId === 'maze.inspect' && action.arguments.scope === 'decision') {
    fields(action.arguments, 'scope'); return { kind: 'decision' as const };
  }
  if (action.capabilityId === 'maze.inspect' && action.arguments.scope === 'objective') {
    fields(action.arguments, 'scope'); return { kind: 'objective' as const };
  }
  if (action.capabilityId === 'maze.inspect') return ['quests', 'quest'].includes(action.arguments.scope as string)
    ? { kind: 'quest' as const, args: questArgs(action.arguments) } : { kind: 'inspect' as const, args: inspectArgs(action.arguments) };
  if (action.capabilityId === 'maze.interact') return { kind: 'interact' as const, selection: chestArgs(action.arguments, publication) };
  if (action.capabilityId === 'maze.explore') {
    return { kind: 'explore' as const, ...exploreArgs(action.arguments, publication) };
  }
  check(action.capabilityId === 'maze.navigate', 'unsupported capability');
  const args = fields(action.arguments, 'level spaceId row column');
  const target = localPosition(args as unknown as Parameters<typeof localPosition>[0]); destinationPosition(target);
  return { kind: 'navigate' as const, target };
}

/** One reserved action only. The transport controls continuation after admission, not this dispatcher. */
export async function executeGameAction(port: CanonicalHostPort, binding: ActionBinding, identity: PreparedAction) {
  binding = captureBinding(binding); identity = snapshotPrepared(identity);
  let command: ReturnType<typeof parse> | undefined;
  try { command = parse(identity.action, binding.publication); } catch { /* Invalid arguments produce an explicit, non-effect refusal. */ }
  let refusal = command ? undefined : 'Invalid arguments for this capability.';
  if (command?.kind === 'interact') {
    let selected;
    try { selected = await selectedChest(binding, command.selection); } catch { /* Refuse an invalid/stale disclosed selector. */ }
    if (selected) return admitChest(port, binding, identity, command.selection, selected);
    refusal = 'Chest selection is not an eligible current-tile observation.';
  }
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
  if (command?.kind === 'explore') {
    const { selection, room } = command;
    const current = await readCanonical(async pages => {
      const publication = await readPublication(pages, binding.publication);
      const checkpoint = gameCheckpoint(publication.snapshot.checkpoint);
      return (!room || checkpoint.position.cell.spaceId === selection.at.cell.spaceId)
        && isCurrentFrontier(pages, checkpoint, selection);
    });
    if (!current.value) refusal = 'Frontier selection is not a current earned approach.';
  }
  if ((command?.kind === 'navigate' || command?.kind === 'explore') && !refusal) {
    // The canonical executor rechecks frontier evidence inside the admission transaction.
    const destination = command.kind === 'explore' ? (command.room ? createExplorationBinding : createFrontierBinding)(command.selection)
      : createDestinationBinding(command.target);
    const operationId = `travel-${identity.storageKey.slice(-64)}`, exploring = command.kind === 'explore';
    const hooks = navigationActionHooks(identity, async view => {
      const earned = await observeMaze({ ...view.knowledge, savedSnapshot: view.savedSnapshot, sourceReceipt: view.sourceReceipt },
        snapshotOf(view.head), binding.publication);
      const afterRevision = view.head.revision + 1;
      return { ...actionResult(identity, { ...earned, revision: afterRevision, data: { ...earned.data,
        revisionContext: { kind: 'navigation-admission', publicationRevision: earned.revision, commitRevision: afterRevision } } },
      exploring ? 'Frontier intention admitted. Movement awaits service custody confirmation.' : 'Destination admitted. Movement awaits service custody confirmation.'),
      operation: { operationId, summary: destination.kind === 'frontier-exploration'
        ? 'Explore the selected local space; stop for material evidence or scope boundaries, without interactions.'
        : exploring ? 'Approach the selected earned frontier anchor only.' : 'Navigate to the chosen earned destination.' } };
    });
    return port.submitHostCommand({ kind: 'fresh', operation: 'operation.admit',
      input: { operationId, binding: json(destination), terminalBytes: MIN_TERMINAL_BYTES, ackPolicy: 'verified-host' },
      execute: (input, options) => executeNavigationCommand(pinDeadline(input, identity.action), { ...options, host: {
        async prepare(view) {
          await actionGrant({ head: view.head, pages: { get: (_area, key) => view.getExecution(key),
            savedSnapshot: view.savedSnapshot, sourceReceipt: view.sourceReceipt }, liveOperation: view.liveOperation }, binding, identity.action);
          await hooks.prepare(view);
        }, commit: hooks.commit,
      } }) });
  }
  const selected = command, message = refusal;
  const decisionRequested = identity.action.capabilityId === 'maze.inspect' && identity.action.arguments.scope === 'decision';
  return port.submitHostCommand({ kind: 'fresh', operation: 'agentica.action.resolve', input: { action: identity.storageKey },
    execute: (input, options) => {
      const request = pinDeadline(input, identity.action);
      return executeCanonical(request, async tx => {
        const bounded = decisionRequested ? decisionPages(launchPages(tx)) : null;
        const context = bounded ? { head: tx.head, pages: bounded.pages, liveOperation: bounded.pages.liveOperation } : tx;
        const authorized = await actionGrant(context, binding, identity.action);
        let rejected = message;
        if (decisionRequested) {
          const refuse = async (summary: string) => {
            const publication = authorized.publication;
            const result = actionResult(identity, { observationId: binding.publication.id, revision: publication.wireRevision,
              observedAt: gameCheckpoint(publication.snapshot.checkpoint).updatedAt, data: { scope: 'decision', state: 'refused' } },
            summary, 'refused');
            return (await retainActionResult(tx, request, identity, result)).receipt;
          };
          if (rejected) return refuse(rejected);
          try {
            const checked = await queryDecision(context, identity, binding);
            return (await retainActionResult(tx, request, identity, checked.result, undefined, undefined, checked.proof)).receipt;
          } catch (error) {
            if (!(error instanceof DecisionQueryRefusal)) throw error;
            return refuse(error.message);
          }
        }
        if (!rejected && selected?.kind === 'objective') {
          try {
            const checked = await queryObjective(tx, identity, binding);
            return (await retainActionResult(tx, request, identity, checked.result, undefined, checked.proof)).receipt;
          } catch (error) { if (!(error instanceof ObjectiveRefusal)) throw error; rejected = error.message; }
        }
        if (selected?.kind === 'inspect') {
          try { cursorAfter(selected.args.cursor, binding.publication, inspectQuery(selected.args, gameCheckpoint(tx.head.checkpoint))); }
          catch { rejected = 'Inspection cursor or query does not belong to this publication.'; }
        }
        let journal: Awaited<ReturnType<typeof queryQuests>> | undefined;
        if (!rejected && selected?.kind === 'quest') {
          try { journal = await queryQuests(tx.pages, snapshotOf(tx.head), binding, identity, selected.args); }
          catch (error) { if (!(error instanceof QuestQueryRefusal)) throw error; rejected = error.message; }
        }
        const observation = journal?.observation ?? (!rejected && selected?.kind === 'inspect'
          ? await inspectMaze(tx.pages, snapshotOf(tx.head), binding.publication, selected.args)
          : await observeMaze(tx.pages, snapshotOf(tx.head), binding.publication));
        const result = actionResult(identity, observation, rejected ?? (journal ? 'Accepted quest information returned without looking at its target.'
          : 'Earned observation returned without refreshing sight.'), rejected ? 'refused' : 'applied');
        return (await retainActionResult(tx, request, identity, result, journal?.query)).receipt;
      }, options);
    } });
}
