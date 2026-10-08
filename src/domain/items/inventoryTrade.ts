import type { GameState, ItemInstance } from '../types';
import { findBaseItem, itemSummary } from './catalog';
import { clampActorVitals, isEquipmentItem, isItemEquipped, removeItemFromEquipment } from './equipment';
import { autoEquipBestGear } from './equipmentOptimizer';
import { BALANCED_GEAR_POLICY, retainGearForParty, type GearEvaluationPolicy } from './gearEvaluation';
import { ambiguousItemIds } from './itemOwnership';
import { normalizeInventoryPolicy } from './inventoryPolicy';
import { consumeStackItem, itemQuantity, mergeInventoryItems } from './itemStacks';
import { createVendorItem } from './loot';

export function buyVendorItem(game: GameState, baseId: string, policy: GearEvaluationPolicy = BALANCED_GEAR_POLICY): GameState {
  const base = findBaseItem(baseId);
  if (game.mode !== 'town' || !base || !Number.isFinite(game.inventory.gold) || game.inventory.gold < base.value) return game;
  // Consumable potency does not scale with floor; fixed vendor level keeps repeat purchases stackable.
  const item = createVendorItem(baseId, base.slot ? game.dungeonLevel : 1);
  const { inventory, accepted } = mergeInventoryItems(game.inventory, [item], false, ambiguousItemIds(game));
  if (accepted.length === 0) return game;
  const next: GameState = {
    ...game,
    inventory: { ...inventory, gold: game.inventory.gold - base.value },
    activityLog: [`Bought ${item.displayName}.`, ...game.activityLog].slice(0, 12),
    updatedAt: new Date().toISOString(),
  };
  return item.slot && normalizeInventoryPolicy(game.inventoryPolicy).autoEquip ? autoEquipBestGear(next, policy) : next;
}

export function getSellValue(item: ItemInstance): number {
  return Number.isFinite(item.value) ? Math.max(1, Math.ceil(item.value * 0.5)) : 0;
}

export function sellItem(game: GameState, itemId: string): GameState {
  const item = game.inventory.items.find((candidate) => candidate.id === itemId);
  if (game.mode !== 'town' || !item || item.locked || itemQuantity(item) === 0 || ambiguousItemIds(game).has(itemId)) return game;
  if (item.category !== 'equipment' && item.category !== 'consumable') return game;
  const sellValue = getSellValue(item);
  const inventory = { ...game.inventory, gold: game.inventory.gold + sellValue, items: consumeStackItem(game.inventory.items, itemId) };
  return {
    ...game,
    inventory,
    party: inventory.items.some((candidate) => candidate.id === itemId) ? game.party : game.party.map((actor) =>
      clampActorVitals({ ...actor, equipment: removeItemFromEquipment(actor.equipment, itemId) }, inventory)),
    activityLog: [`Sold ${itemSummary({ ...item, quantity: 1 })} for ${sellValue}g.`, ...game.activityLog].slice(0, 12),
    updatedAt: new Date().toISOString(),
  };
}

export type InventoryScope = 'pack' | 'stash' | 'all';

/** All rarities are sellable when not an upgrade for any hero; locks and non-gear always survive. */
export function junkItemsForSale(game: GameState, scope: InventoryScope = 'all', policy: GearEvaluationPolicy = BALANCED_GEAR_POLICY): ItemInstance[] {
  const owned = [...game.inventory.items, ...game.stash.items];
  const ambiguous = ambiguousItemIds(game);
  const candidates = scope === 'pack' ? game.inventory.items : scope === 'stash' ? game.stash.items : owned;
  return candidates.filter((item) => isEquipmentItem(item) && !item.locked && !isItemEquipped(game, item.id) && !ambiguous.has(item.id)
    && Number.isFinite(item.value) && item.value >= 0 && itemQuantity(item) > 0
    && !retainGearForParty(game.party, item, owned, policy));
}

export function sellJunkItems(game: GameState, policy: GearEvaluationPolicy = BALANCED_GEAR_POLICY): GameState {
  if (game.mode !== 'town' || !Number.isFinite(game.inventory.gold) || game.inventory.gold < 0) return game;
  const next = normalizeInventoryPolicy(game.inventoryPolicy).autoEquip ? autoEquipBestGear(game, policy) : game;
  const junk = junkItemsForSale(next, 'all', policy);
  if (junk.length === 0) return next;
  const sold = new Set(junk);
  const gold = junk.reduce((total, item) => total + getSellValue(item) * itemQuantity(item), 0);
  if (!Number.isFinite(next.inventory.gold + gold)) return next;
  return {
    ...next,
    inventory: { ...next.inventory, gold: next.inventory.gold + gold, items: next.inventory.items.filter((item) => !sold.has(item)) },
    stash: { ...next.stash, items: next.stash.items.filter((item) => !sold.has(item)) },
    activityLog: [`Sold ${junk.length} obsolete equipment item${junk.length === 1 ? '' : 's'} from pack/stash for ${gold}g.`, ...next.activityLog].slice(0, 12),
    updatedAt: new Date().toISOString(),
  };
}

export function stashItem(game: GameState, itemId: string): GameState {
  const item = game.inventory.items.find((candidate) => candidate.id === itemId);
  if (game.mode !== 'town' || !item || item.locked || isItemEquipped(game, item.id) || ambiguousItemIds(game).has(itemId)) return game;
  const { inventory: stash, accepted } = mergeInventoryItems(game.stash, [item], false, ambiguousItemIds(game));
  if (accepted.length === 0) return game;
  return {
    ...game,
    inventory: { ...game.inventory, items: game.inventory.items.filter((candidate) => candidate.id !== itemId) },
    stash,
    activityLog: [`Stashed ${itemSummary(item)}.`, ...game.activityLog].slice(0, 12),
    updatedAt: new Date().toISOString(),
  };
}

export function withdrawStashItem(game: GameState, itemId: string): GameState {
  const item = game.stash.items.find((candidate) => candidate.id === itemId);
  if (game.mode !== 'town' || !item || ambiguousItemIds(game).has(itemId)) return game;
  const { inventory, accepted } = mergeInventoryItems(game.inventory, [item], false, ambiguousItemIds(game));
  if (accepted.length === 0) return game;
  const next: GameState = {
    ...game,
    inventory,
    stash: { ...game.stash, items: game.stash.items.filter((candidate) => candidate.id !== itemId) },
    activityLog: [`Withdrew ${itemSummary(item)}.`, ...game.activityLog].slice(0, 12),
    updatedAt: new Date().toISOString(),
  };
  return normalizeInventoryPolicy(game.inventoryPolicy).autoEquip ? autoEquipBestGear(next) : next;
}
