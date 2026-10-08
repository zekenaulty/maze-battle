import type { EquipmentSlot, GameState, InventoryState, ItemInstance, StashState } from '../types';
import { itemSummary } from './catalog';
import { createItemInstance } from './loot';
import { clampActorVitals, getEffectiveActor, omitSlot, removeItemFromEquipment } from './equipment';
import { autoEquipBestGear } from './equipmentOptimizer';
import { normalizeInventoryPolicy } from './inventoryPolicy';
import { consumeStackItem, itemQuantity, mergeInventoryItems, normalizeCapacity, stackInventoryItems } from './itemStacks';
import { useTownPortal } from '../town/portal';

export { getEffectiveActor, getEquipmentStats, getEquippedItems, isItemEquipped } from './equipment';
export { autoEquipBestGear } from './equipmentOptimizer';
export { normalizeInventoryPolicy, setInventoryPolicy, toggleItemLock } from './inventoryPolicy';
export { buyVendorItem, getSellValue, junkItemsForSale, sellItem, sellJunkItems, stashItem, withdrawStashItem } from './inventoryTrade';
export { manageAutoInventory } from './autoInventory';

const STARTING_GOLD = 35;
const STARTER_ITEMS = ['health-herb', 'mana-vial', 'town-portal'];

export function createInitialInventory(): InventoryState {
  return {
    capacity: 36,
    gold: STARTING_GOLD,
    items: STARTER_ITEMS.map((baseId) => createItemInstance(baseId, 1, 'common', () => 0.5)),
  };
}

export function createInitialStash(): StashState {
  return { capacity: 96, items: [] };
}

export function normalizeInventory(inventory: Partial<InventoryState> | undefined): InventoryState {
  if (!inventory) return createInitialInventory();
  return {
    capacity: normalizeCapacity(inventory.capacity, 36),
    gold: Number.isFinite(inventory.gold) ? Math.max(0, inventory.gold!) : STARTING_GOLD,
    items: stackInventoryItems(inventory.items ?? []),
  };
}

export function normalizeStash(stash: Partial<StashState> | undefined): StashState {
  return { capacity: normalizeCapacity(stash?.capacity, 96), items: stackInventoryItems(stash?.items ?? []) };
}

export function addItemsToInventory(game: GameState, items: ItemInstance[], source: string): GameState {
  if (items.length === 0) return game;
  // Awarded loot has no ground container to return to; retain it in an overfull pack.
  const { inventory, accepted } = mergeInventoryItems(game.inventory, items, true);
  if (accepted.length === 0) return game;
  const overflow = inventory.items.length > inventory.capacity ? ' Pack over capacity; make room in town.' : '';
  const next: GameState = {
    ...game,
    inventory,
    activityLog: [`${source}: ${accepted.map(itemSummary).join(', ')}.${overflow}`, ...game.activityLog].slice(0, 12),
    updatedAt: new Date().toISOString(),
  };
  return normalizeInventoryPolicy(game.inventoryPolicy).autoEquip ? autoEquipBestGear(next) : next;
}

export function equipItem(game: GameState, actorId: string, itemId: string): GameState {
  const item = game.inventory.items.find((candidate) => candidate.id === itemId);
  const actor = game.party.find((candidate) => candidate.id === actorId);
  if (!item?.slot || !actor) return game;
  const slot = item.slot;
  const party = game.party.map((candidate) => {
    const equipment = removeItemFromEquipment(candidate.equipment, itemId);
    return clampActorVitals({
      ...candidate,
      equipment: candidate.id === actorId ? { ...equipment, [slot]: item.id } : equipment,
    }, game.inventory);
  });
  return {
    ...game,
    party,
    activityLog: [`${actor.displayName} equipped ${item.displayName}.`, ...game.activityLog].slice(0, 12),
    updatedAt: new Date().toISOString(),
  };
}

export function unequipItem(game: GameState, actorId: string, slot: EquipmentSlot): GameState {
  const actor = game.party.find((candidate) => candidate.id === actorId);
  if (!actor?.equipment[slot]) return game;
  const item = game.inventory.items.find((candidate) => candidate.id === actor.equipment[slot]);
  return {
    ...game,
    party: game.party.map((candidate) => candidate.id !== actorId ? candidate
      : clampActorVitals({ ...candidate, equipment: omitSlot(candidate.equipment, slot) }, game.inventory)),
    activityLog: [`${actor.displayName} unequipped ${item?.displayName ?? slot}.`, ...game.activityLog].slice(0, 12),
    updatedAt: new Date().toISOString(),
  };
}

export function useConsumable(game: GameState, itemId: string, actorId?: string): GameState {
  const item = game.inventory.items.find((candidate) => candidate.id === itemId);
  if (!item?.consumableEffect || item.slot || item.locked || itemQuantity(item) === 0) return game;
  if (item.consumableEffect === 'townPortal') return useTownPortal(game, itemId);
  const resource = item.consumableEffect === 'mana' ? 'mp' : 'hp';
  const maximum = resource === 'mp' ? 'maxMp' : 'maxHp';
  const needsResource = (actor: GameState['party'][number]) => actor.hp > 0 && actor[resource] < getEffectiveActor(actor, game.inventory)[maximum];
  const actor = actorId === undefined ? game.party.find(needsResource) : game.party.find((candidate) => candidate.id === actorId);
  const amount = item.consumableAmount ?? 0;
  if (!actor || !needsResource(actor) || !Number.isFinite(amount) || amount <= 0) return game;
  const effective = getEffectiveActor(actor, game.inventory);
  return {
    ...game,
    party: game.party.map((candidate) => candidate.id === actor.id
      ? { ...candidate, [resource]: Math.min(effective[maximum], candidate[resource] + amount) } : candidate),
    inventory: { ...game.inventory, items: consumeStackItem(game.inventory.items, itemId) },
    activityLog: [`${actor.displayName} used ${item.displayName}.`, ...game.activityLog].slice(0, 12),
    updatedAt: new Date().toISOString(),
  };
}

export function recoverParty(game: GameState): GameState {
  const party = game.party.map((actor) => {
    const effective = getEffectiveActor(actor, game.inventory);
    return { ...actor, hp: effective.maxHp, mp: effective.maxMp };
  });
  if (party.every((actor, index) => actor.hp === game.party[index].hp && actor.mp === game.party[index].mp)) return game;
  return {
    ...game,
    party,
    activityLog: ['The party rested at the inn.', ...game.activityLog].slice(0, 12),
    updatedAt: new Date().toISOString(),
  };
}
