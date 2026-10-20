import type { GameSession } from '../../src/services/game/GameSession';
import { readCanonical } from '../../src/persistence/canonical/read';
import { loadChest, loadRoomContent } from '../../src/persistence/canonical/content/records';
import { chestEffects, type ChestTarget } from './canonical-start-service.chest-fixture';

/** Owner setup through the actual App session: accept the public offer without exploring a tile. */
export async function acceptAppSurvey() {
  const session = Reflect.get(globalThis, '__canonicalStartAppSession') as GameSession | undefined;
  if (!session?.view.controlled || session.view.recoveryRequired) throw Error('Actual App session required.');
  const first = structuredClone(session.view.game!.observation);
  const position = structuredClone(session.view.game!.checkpoint.position);
  const receipts = [await session.execute('exploration', { kind: 'stairs', direction: 'up' })];
  const quest = session.view.game!.contracts.find(contract => contract.task.item?.baseId === 'survey-seal');
  if (!quest) throw Error('The public guild offer is missing.');
  receipts.push(await session.execute('content', { kind: 'accept-quest', contractId: quest.id }));
  receipts.push(await session.execute('roster', { kind: 'leave-town' }));
  if (JSON.stringify(position) !== JSON.stringify(session.view.game!.checkpoint.position)) throw Error('Setup must not move.');
  // Independent test oracle. Never supplied to the planner or used to choose its actions.
  const target = (await readCanonical(async pages => {
    const content = await loadRoomContent(pages, 1, quest.targetRoomId);
    if (!content.chestId) throw Error('Missing authored ordinary chest.');
    const chest = await loadChest(pages, 1, content.chestId);
    return { level: 1, contractId: quest.id, chestId: chest.chest.id,
      at: { level: 1, cell: { spaceId: quest.targetRoomId, ...chest.chest.position } } } satisfies ChestTarget;
  })).value;
  return { first, position, receipts, target, before: await chestEffects(target) };
}
