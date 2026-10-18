import type { Direction } from '../../src/domain/types';
import type { GameSession } from '../../src/services/game/GameSession';
import { matchesQuestItem } from '../../src/domain/quests/questItems';
import { readCanonical } from '../../src/persistence/canonical/read';
import { gameCheckpoint, rosterContext } from '../../src/persistence/canonical/game/checkpoint';
import { loadRoster } from '../../src/persistence/canonical/roster/projection';
import { loadAcceptedQuest, loadChest, loadContract } from '../../src/persistence/canonical/content/records';
import { DIRECTIONS, type ObservedCell } from '../../src/persistence/canonical/knowledge/types';
import type { WorldPosition } from '../../src/persistence/canonical/world/types';
import { appNavigationEvidence } from './canonical-start-service.app-evidence';
import type { AgenticaAction } from '../../src/services/agentica/contracts';
import { loadRunGrant } from '../../src/persistence/canonical/agentica/run-grant.read';

export async function chestOperationEvidence(action: AgenticaAction, successor?: AgenticaAction) {
  const evidence = await appNavigationEvidence(action, successor);
  if (evidence.parent?.kind !== 'interaction') throw Error('Expected the exact confirmed interaction.');
  const successorGrant = evidence.claim && evidence.selection
    ? (await readCanonical(pages => loadRunGrant(pages, evidence.selection!.value.data.grant))).value : null;
  const predecessorAck = evidence.parent.operation.acknowledgementAttemptId
    ? (await readCanonical(pages => pages.sourceReceipt(evidence.parent!.operation.acknowledgementAttemptId!))).value : null;
  return { ...evidence, parent: evidence.parent, successorGrant, predecessorAck };
}
const key = (at: WorldPosition) => JSON.stringify([at.level, at.cell.spaceId, at.cell.row, at.cell.column]);
function appSession() {
  const session = Reflect.get(globalThis, '__canonicalStartAppSession') as GameSession | undefined;
  if (!session?.view.controlled || session.view.recoveryRequired) throw Error('The actual App must own a ready GameSession.');
  return session;
}
export interface ChestTarget { level: number; contractId: string; chestId: string; at: WorldPosition }

/** Ordinary manual setup from guild offers and accumulated sight. No teleport, hidden map or alternate game/store. */
export async function prepareAppChest() {
  const session = appSession(), initial = structuredClone(session.view.game!.snapshot);
  const receipts: { kind: Parameters<GameSession['execute']>[0]; input: Parameters<GameSession['execute']>[1];
    receipt: Awaited<ReturnType<GameSession['execute']>> }[] = [];
  const execute = async (...[kind, input]: Parameters<GameSession['execute']>) => {
    const receipt = await session.execute(kind, input); receipts.push({ kind, input, receipt }); return receipt;
  };
  await execute('exploration', { kind: 'stairs', direction: 'up' });
  const contract = session.view.game!.contracts.find(candidate => candidate.objective === 'fetch');
  if (!contract) throw Error('Seed 2 must disclose a real fetch contract on the guild board.');
  await execute('content', { kind: 'accept-quest', contractId: contract.id });
  await execute('roster', { kind: 'leave-town' });
  const known = new Map<string, ObservedCell>();
  for (let moves = 0; moves <= 256; moves++) {
    const game = session.view.game!, at = game.checkpoint.position;
    if (!game.observation || key(game.observation.header.actor) !== key(at)) throw Error('Manual setup lost current earned sight.');
    for (const cell of game.observation.cells) {
      const prior = known.get(key(cell.at));
      known.set(key(cell.at), { ...structuredClone(cell), edges: { ...prior?.edges, ...structuredClone(cell.edges) } });
    }
    if (known.size > 4096) throw Error('Manual chest setup exceeded its earned-cell bound.');
    const current = game.observation.cells.find(cell => key(cell.at) === key(at))!;
    const chest = at.cell.spaceId === contract.targetRoomId ? current.chests.find(candidate => !candidate.opened) : undefined;
    if (chest) {
      const target: ChestTarget = { level: at.level, contractId: contract.id, chestId: chest.id, at: structuredClone(at) };
      return { target, contract, initial, moves, receipts, before: await chestEffects(target) };
    }
    if (moves === 256) break;
    const queue: { at: WorldPosition; first?: Direction }[] = [{ at }], seen = new Set([key(at)]);
    let frontier: Direction | undefined, towardChest: Direction | undefined;
    for (let i = 0; i < queue.length; i++) {
      const node = queue[i], cell = known.get(key(node.at));
      if (!cell) continue;
      if (node.first && cell.at.cell.spaceId === contract.targetRoomId && cell.chests.some(candidate => !candidate.opened)) {
        towardChest = node.first; break;
      }
      if (node.first && frontier === undefined && DIRECTIONS.some(direction => !Object.hasOwn(cell.edges, direction))) frontier = node.first;
      for (const direction of DIRECTIONS) {
        const target = cell.edges[direction];
        if (!target || seen.has(key(target))) continue;
        seen.add(key(target)); queue.push({ at: target, first: node.first ?? direction });
      }
    }
    const direction = towardChest ?? frontier;
    if (!direction) throw Error('No earned route or unresolved boundary leads to the disclosed quest room.');
    await execute('exploration', { kind: 'move', direction, triggerStairs: false });
    if (key(session.view.game!.checkpoint.position) === key(at)) throw Error('The earned manual setup route was obstructed.');
  }
  throw Error('Manual chest setup exceeded 256 ordinary moves.');
}

/** Independent effect oracle, never returned to the planner or used for setup routing. */
export async function chestEffects(target: ChestTarget) {
  const result = await readCanonical(async (pages, snapshot) => {
    const checkpoint = gameCheckpoint(snapshot.checkpoint), contract = await loadContract(pages, target.contractId);
    const quest = await loadAcceptedQuest(pages, contract);
    if (!quest) throw Error('Missing preaccepted quest.');
    const roster = (await loadRoster(pages, rosterContext(checkpoint))).state;
    return { checkpoint, chest: await loadChest(pages, target.level, target.chestId), quest,
      inventory: roster.inventory, stash: roster.stash,
      questItems: [...roster.inventory.items, ...roster.stash.items].filter(item => matchesQuestItem(item, quest.quest)) };
  });
  return { head: result.head, ...result.value };
}
