import { describe, expect, it } from 'vitest';
import { chestAt, lineMaze, questFor, roomAt } from '../automation/autopilotTestFixtures';
import { createNewGameState, normalizeGameState } from '../gameFactory';
import { consumableCount } from '../items/autoInventory';
import { autoEquipBestGear, equipItem, junkItemsForSale, manageAutoInventory, normalizeInventory, normalizeStash,
  sellItem, sellJunkItems, stashItem, useConsumable, withdrawStashItem } from '../items/inventory';
import { isStackableItem, mergeInventoryItems, stackInventoryItems } from '../items/itemStacks';
import { createItemInstance } from '../items/loot';
import { useTownPortal } from '../town/portal';
import type { GameState, ItemInstance, QuestItemSpec } from '../types';
import { matchesQuestItem, ownedQuestItemCount } from './questItems';
import { recordFetchQuestProgress, updateQuestProgress } from './quests';

const room = roomAt('cache', 'treasure', 2);
const spec: QuestItemSpec = { baseId: 'guild-cache', displayName: 'Guild Cache', token: '[G]' };
const legacy = questFor(room, 'fetch');
const quest = { ...legacy, task: { ...legacy.task, item: spec } };
const collectible: ItemInstance = { ...spec, id: 'collectible', questId: quest.id, category: 'quest',
  rarity: 'common', itemLevel: 1, value: 0, quantity: 1 };

function itemGame(items: ItemInstance[] = [collectible]): GameState {
  return { ...createNewGameState({ maze: lineMaze(5, [room], 2), chests: [chestAt(2, true)],
    inventory: { capacity: 36, gold: 0, items }, inventoryPolicy: { autoRestock: false } }), quests: [quest] };
}

describe('quest collectible ownership and protection', () => {
  it.each([
    { questId: 'another-quest' }, { questId: undefined }, { baseId: 'another-base' }, { token: 'other' },
    { category: 'consumable' as const }, { quantity: 0 }, { quantity: -1 }, { quantity: 0.5 }, { quantity: Infinity },
  ])('does not credit an incompatible or empty collectible: %j', (patch) => {
    const item = { ...collectible, ...patch }, game = itemGame([item]);
    expect(matchesQuestItem(item, quest)).toBe(false);
    expect(ownedQuestItemCount(game, quest)).toBe(0);
    expect(updateQuestProgress(game)).toBe(game);
    expect(recordFetchQuestProgress(game, room.center)).toBe(game);
  });

  it('uses identity and quantity rather than display text, and never opts legacy quests in', () => {
    const renamed = { ...collectible, displayName: 'Renamed cache', quantity: undefined };
    expect(matchesQuestItem(renamed, quest)).toBe(true);
    expect(matchesQuestItem(collectible, legacy)).toBe(false);
    expect(ownedQuestItemCount(itemGame([renamed]), quest)).toBe(1);
  });

  it('recomputes active item progress from ownership without changing legacy monotonic progress', () => {
    const game = itemGame([]);
    game.quests = [{ ...quest, task: { ...quest.task, required: 2, progress: 1 } }];
    expect(updateQuestProgress(game).quests[0].task.progress).toBe(0);
    expect(recordFetchQuestProgress(game, room.center).quests[0].task.progress).toBe(0);
    const owned = itemGame([{ ...collectible, quantity: 2 }]);
    owned.quests = [{ ...quest, task: { ...quest.task, required: 2 } }];
    expect(updateQuestProgress(owned).quests[0]).toMatchObject({ status: 'complete', task: { progress: 2 } });
  });

  it('category alone prevents sale, auto-sale, equipment and consumable use, including misleading metadata', () => {
    const gear: ItemInstance = { ...collectible, id: 'quest-gear', slot: 'weapon', value: 10000, stats: { baseDamage: 10000 } };
    const supplies = (['heal', 'mana', 'townPortal'] as const).map((effect) => ({
      ...collectible, id: `quest-${effect}`, consumableEffect: effect, consumableAmount: 10000,
    }));
    const game = itemGame([collectible, gear, ...supplies]);
    game.party = game.party.map((actor) => ({ ...actor, hp: 1, mp: 0 }));
    for (const item of game.inventory.items) {
      expect(equipItem(game, game.party[0].id, item.id)).toBe(game);
      expect(useConsumable(game, item.id)).toBe(game);
    }
    expect(useTownPortal(game, 'quest-townPortal')).toBe(game);
    expect(consumableCount(game, 'heal')).toBe(0);
    expect(consumableCount(game, 'mana')).toBe(0);
    expect(consumableCount(game, 'townPortal')).toBe(0);
    const town: GameState = { ...game, mode: 'town', stash: { capacity: 96, items: [{ ...gear, id: 'stashed-quest' }] } };
    for (const item of town.inventory.items) expect(sellItem(town, item.id)).toBe(town);
    expect(junkItemsForSale(town)).toEqual([]);
    expect(sellJunkItems(town)).toBe(town);
    expect(autoEquipBestGear(town)).toBe(town);
    expect(manageAutoInventory(town)).toBe(town);
  });

  it('keeps collectible identities separate while normalizing and merging ordinary supply stacks', () => {
    const other = { ...collectible, id: 'other-collectible', questId: 'other-quest' };
    const items = [collectible, other];
    expect(isStackableItem(collectible)).toBe(false);
    expect(stackInventoryItems(items)).toEqual(items);
    expect(normalizeInventory({ capacity: 1, items }).items).toEqual(items);
    expect(normalizeStash({ capacity: 1, items }).items).toEqual(items);
    const herb = createItemInstance('health-herb', 1);
    const merged = mergeInventoryItems({ capacity: 1, items: [collectible, herb] },
      [other, { ...herb, id: 'second-herb' }], true);
    expect(merged.accepted).toHaveLength(2);
    expect(merged.inventory.items).toEqual([collectible, { ...herb, quantity: 2 }, other]);
  });

  it('preserves pack/stash items and chest award history through repeated JSON normalization', () => {
    const game = itemGame();
    game.chests[0].loot = [collectible];
    game.stash.items = [{ ...collectible, id: 'other-collectible', questId: 'other-quest' }];
    let loaded = game;
    for (let i = 0; i < 3; i++) {
      loaded = normalizeGameState(JSON.parse(JSON.stringify(loaded)));
      expect(loaded.inventory).toEqual(game.inventory);
      expect(loaded.stash).toEqual(game.stash);
      expect(loaded.chests).toEqual(game.chests);
      expect(loaded.activityLog).toEqual(game.activityLog);
      expect(loaded.updatedAt).toBe(game.updatedAt);
    }
  });

  it('allows explicit stash/withdraw without losing identity or owned progress', () => {
    const game: GameState = { ...itemGame(), mode: 'town' };
    const stashed = stashItem(game, collectible.id);
    expect(stashed.inventory.items).toEqual([]);
    expect(stashed.stash.items).toEqual([collectible]);
    expect(ownedQuestItemCount(stashed, quest)).toBe(1);
    const withdrawn = withdrawStashItem(stashed, collectible.id);
    expect(withdrawn.inventory.items).toEqual([collectible]);
    expect(withdrawn.stash.items).toEqual([]);
    expect(ownedQuestItemCount(withdrawn, quest)).toBe(1);
    const full = { ...stashed, inventory: { ...stashed.inventory, capacity: 0 } };
    expect(withdrawStashItem(full, collectible.id)).toBe(full);
  });
});
