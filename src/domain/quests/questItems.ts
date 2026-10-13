import type { ChestState, GameState, ItemInstance, QuestState } from '../types';
import { itemQuantity } from '../items/itemQuantity';
import { isInRoom } from './questTargets';
import type { RosterState } from '../party/roster';

export function matchesQuestItem(item: ItemInstance, quest: QuestState): boolean {
  const spec = quest.task.objective === 'fetch' ? quest.task.item : undefined;
  return !!spec && item.category === 'quest' && item.questId === quest.id
    && item.baseId === spec.baseId && item.token === spec.token && itemQuantity(item) > 0;
}

/** Ordinary progress counts pack and stash ownership; return adapters may require the pack. */
export function ownedQuestItemCount(game: Pick<RosterState, 'inventory' | 'stash'>, quest: QuestState): number {
  return [...game.inventory.items, ...game.stash.items]
    .reduce((count, item) => count + (matchesQuestItem(item, quest) ? itemQuantity(item) : 0), 0);
}

export interface QuestChestFacts {
  floor: number;
  opened: boolean;
  targetEligible: boolean;
  ownedCount: number;
  alreadyAwarded: boolean;
}

/** Ownership and award history are separate facts; neither is inferred from an opened flag. */
export function questItemForChest(quest: QuestState, facts: QuestChestFacts): ItemInstance | undefined {
  if (facts.opened || quest.status !== 'active' || quest.floor !== facts.floor
    || quest.task.objective !== 'fetch' || !quest.task.item || !facts.targetEligible
    || facts.ownedCount > 0 || facts.alreadyAwarded) return undefined;
  return {
    ...quest.task.item, id: `quest-item:${quest.id}`, questId: quest.id, category: 'quest',
    rarity: 'common', itemLevel: quest.floor, value: 0, quantity: 1,
  };
}

/** Only materialize collectibles when the shared chest command actually opens the chest. */
export function questItemsForChest(game: GameState, chest: ChestState): ItemInstance[] {
  if (chest.opened || chest.level !== game.dungeonLevel) return [];
  return game.quests.flatMap((quest): ItemInstance[] => {
    if (quest.status !== 'active' || quest.floor !== chest.level || quest.task.objective !== 'fetch' || !quest.task.item) return [];
    const room = game.maze.layout?.rooms.find((candidate) => candidate.id === quest.targetRoomId);
    const item = questItemForChest(quest, {
      floor: chest.level, opened: chest.opened, targetEligible: !!room && isInRoom(chest.position, room),
      ownedCount: ownedQuestItemCount(game, quest),
      alreadyAwarded: game.chests.some((candidate) => candidate.opened && candidate.loot?.some((item) => matchesQuestItem(item, quest))),
    });
    return item ? [item] : [];
  });
}
