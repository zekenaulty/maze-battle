import type { EquipmentSlot, GameState, InventoryState, ItemInstance, StashState } from '../types';
import { itemSummary } from './catalog';
import { createItemInstance } from './loot';
import { clampActorVitals, getEffectiveActor, isEquipmentItem, omitSlot, removeItemFromEquipment } from './equipment';
import { autoEquipBestGear } from './equipmentOptimizer';
import { normalizeInventoryPolicy } from './inventoryPolicy';
import { consumeStackItem, itemQuantity, mergeInventoryItems, normalizeCapacity, stackInventoryItems } from './itemStacks';
import { useTownPortal } from '../town/portal';
import { ambiguousEquipmentIds, ambiguousItemIds, duplicateItemIds } from './itemOwnership';
import { canApplyPackChange, equippedPackItemIds, packSlotUsage } from './packCapacity';

export { getEffectiveActor, getEquipmentStats, getEquippedItems, isItemEquipped } from './equipment';
export { autoEquipBestGear } from './equipmentOptimizer';
export { normalizeInventoryPolicy, setInventoryPolicy, toggleItemLock } from './inventoryPolicy';
export { buyVendorItem, getSellValue, junkItemsForSale, sellItem, sellJunkItems, stashItem, withdrawStashItem } from './inventoryTrade';
export type { InventoryScope } from './inventoryTrade';
export { manageAutoInventory } from './autoInventory';
export { BALANCED_GEAR_POLICY, evaluateGearUpgrade, evaluateLoadoutChange, getLoadoutMetrics } from './gearEvaluation';
export type { GearEvaluation, GearEvaluationPolicy, GearMetrics, GearDecision, GearReason } from './gearEvaluation';
export { ambiguousItemIds, ambiguousEquipmentIds } from './itemOwnership';
export { packSlotUsage, equippedPackItemIds, canApplyPackChange } from './packCapacity';

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

export function normalizeInventory(inventory: Partial<InventoryState> | undefined, protectedIds?: ReadonlySet<string>): InventoryState {
  if (!inventory) return createInitialInventory();
  return {
    capacity: normalizeCapacity(inventory.capacity, 36),
    gold: Number.isFinite(inventory.gold) ? Math.max(0, inventory.gold!) : STARTING_GOLD,
    items: stackInventoryItems(inventory.items ?? [], protectedIds),
  };
}

export function normalizeStash(stash: Partial<StashState> | undefined, protectedIds?: ReadonlySet<string>): StashState {
  return { capacity: normalizeCapacity(stash?.capacity, 96), items: stackInventoryItems(stash?.items ?? [], protectedIds) };
}

export function addItemsToInventory(game: GameState, items: ItemInstance[], source: string): GameState {
  if (items.length === 0) return game;
  // Awarded loot has no ground container to return to; retain it in an overfull pack.
  const protectedIds = duplicateItemIds([...game.inventory.items, ...game.stash.items, ...items]);
  const { inventory, accepted } = mergeInventoryItems(game.inventory, items, true, protectedIds, equippedPackItemIds(game));
  if (accepted.length === 0) return game;
  const next: GameState = {
    ...game,
    inventory,
    updatedAt: new Date().toISOString(),
  };
  const equipped = normalizeInventoryPolicy(game.inventoryPolicy).autoEquip ? autoEquipBestGear(next) : next;
  const overflow = packSlotUsage(equipped) > inventory.capacity ? ' Pack over capacity; make room in town.' : '';
  return { ...equipped, activityLog: [`${source}: ${accepted.map(itemSummary).join(', ')}.${overflow}`, ...equipped.activityLog].slice(0, 12) };
}

export function equipItem(game: GameState, actorId: string, itemId: string): GameState {
  const item = game.inventory.items.find((candidate) => candidate.id === itemId);
  const actor = game.party.find((candidate) => candidate.id === actorId);
  if (!item?.slot || !actor || !isEquipmentItem(item) || itemQuantity(item) !== 1 || !itemId || ambiguousEquipmentIds(game).has(itemId)) return game;
  if (game.party.filter((candidate) => candidate.id === actorId).length !== 1 || actor.equipment[item.slot] === itemId) return game;
  const slot = item.slot;
  const party = game.party.map((candidate) => {
    const equipment = removeItemFromEquipment(candidate.equipment, itemId);
    return {
      ...candidate,
      equipment: candidate.id === actorId ? { ...equipment, [slot]: item.id } : equipment,
    };
  });
  if (!canApplyPackChange(game, { ...game, party })) return game;
  return {
    ...game,
    party: party.map((candidate) => clampActorVitals(candidate, game.inventory)),
    activityLog: [`${actor.displayName} equipped ${item.displayName}.`, ...game.activityLog].slice(0, 12),
    updatedAt: new Date().toISOString(),
  };
}

export function unequipItem(game: GameState, actorId: string, slot: EquipmentSlot): GameState {
  const actor = game.party.find((candidate) => candidate.id === actorId);
  if (!actor?.equipment[slot]) return game;
  if (game.party.filter((candidate) => candidate.id === actorId).length !== 1) return game;
  const item = game.inventory.items.find((candidate) => candidate.id === actor.equipment[slot]);
  const party = game.party.map((candidate) => candidate.id !== actorId ? candidate : { ...candidate, equipment: omitSlot(candidate.equipment, slot) });
  if (!canApplyPackChange(game, { ...game, party })) return game;
  return {
    ...game,
    party: party.map((candidate) => candidate.id !== actorId ? candidate : clampActorVitals(candidate, game.inventory)),
    activityLog: [`${actor.displayName} unequipped ${item?.displayName ?? slot}.`, ...game.activityLog].slice(0, 12),
    updatedAt: new Date().toISOString(),
  };
}

export function useConsumable(game: GameState, itemId: string, actorId?: string): GameState {
  const item = game.inventory.items.find((candidate) => candidate.id === itemId);
  if (!item?.consumableEffect || item.category !== 'consumable' || item.slot || item.locked || itemQuantity(item) === 0 || ambiguousItemIds(game).has(itemId)) return game;
  if (item.consumableEffect === 'townPortal') return useTownPortal(game, itemId);
  if (item.consumableEffect !== 'heal' && item.consumableEffect !== 'mana') return game;
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
