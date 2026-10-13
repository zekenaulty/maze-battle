import type { ItemInstance } from '../types';
import type { RosterState } from '../party/roster';
import { findBaseItem, itemSummary } from './catalog';
import { isEquipmentItem, isItemEquipped } from './equipment';
import { autoEquipBestGear } from './equipmentOptimizer';
import { BALANCED_GEAR_POLICY, retainGearForParty, type GearEvaluationPolicy } from './gearEvaluation';
import { ambiguousItemIds } from './itemOwnership';
import { normalizeInventoryPolicy } from './inventoryPolicy';
import { consumeStackItem, itemQuantity, mergeInventoryItems } from './itemStacks';
import { createVendorItem } from './loot';
import { getSellValue } from './itemValue';
import { equippedPackItemIds } from './packCapacity';

export { getSellValue } from './itemValue';

export function buyVendorItem<T extends RosterState>(game: T, baseId: string, policy: GearEvaluationPolicy = BALANCED_GEAR_POLICY): T {
  const base = findBaseItem(baseId);
  if (game.mode !== 'town' || !base || !Number.isFinite(game.inventory.gold) || game.inventory.gold < base.value) return game;
  // Consumable potency does not scale with floor; fixed vendor level keeps repeat purchases stackable.
  const item = createVendorItem(baseId, base.slot ? game.dungeonLevel : 1);
  const { inventory, accepted } = mergeInventoryItems(game.inventory, [item], false, ambiguousItemIds(game), equippedPackItemIds(game));
  if (accepted.length === 0) return game;
  const next: T = {
    ...game,
    inventory: { ...inventory, gold: game.inventory.gold - base.value },
    activityLog: [`Bought ${item.displayName}.`, ...game.activityLog].slice(0, 12),
    updatedAt: new Date().toISOString(),
  };
  return item.slot && normalizeInventoryPolicy(game.inventoryPolicy).autoEquip ? autoEquipBestGear(next, policy) : next;
}

export function sellItem<T extends RosterState>(game: T, itemId: string, amount = 1): T {
  const item = game.inventory.items.find((candidate) => candidate.id === itemId);
  if (game.mode !== 'town' || !item || item.locked || isItemEquipped(game, itemId) || ambiguousItemIds(game).has(itemId)) return game;
  if (item.category !== 'equipment' && item.category !== 'consumable') return game;
  const sellValue = getSellValue(item, amount);
  if (sellValue <= 0 || !Number.isSafeInteger(game.inventory.gold) || game.inventory.gold < 0 || !Number.isSafeInteger(game.inventory.gold + sellValue)) return game;
  const inventory = { ...game.inventory, gold: game.inventory.gold + sellValue, items: consumeStackItem(game.inventory.items, itemId, amount) };
  return {
    ...game,
    inventory,
    activityLog: [`Sold ${itemSummary({ ...item, quantity: amount })} for ${sellValue}g.`, ...game.activityLog].slice(0, 12),
    updatedAt: new Date().toISOString(),
  };
}

export type InventoryScope = 'pack' | 'stash' | 'all';

/** All rarities are sellable when not an upgrade for any hero; locks and non-gear always survive. */
export function junkItemsForSale(game: Pick<RosterState, 'party' | 'inventory' | 'stash'>, scope: InventoryScope = 'all', policy: GearEvaluationPolicy = BALANCED_GEAR_POLICY): ItemInstance[] {
  const owned = [...game.inventory.items, ...game.stash.items];
  const ambiguous = ambiguousItemIds(game);
  const candidates = scope === 'pack' ? game.inventory.items : scope === 'stash' ? game.stash.items : owned;
  return candidates.filter((item) => isEquipmentItem(item) && !item.locked && !isItemEquipped(game, item.id) && !ambiguous.has(item.id)
    && getSellValue(item, itemQuantity(item)) > 0
    && !retainGearForParty(game.party, item, owned, policy));
}

export function sellJunkItems<T extends RosterState>(game: T, policy: GearEvaluationPolicy = BALANCED_GEAR_POLICY): T {
  if (game.mode !== 'town' || !Number.isSafeInteger(game.inventory.gold) || game.inventory.gold < 0) return game;
  const next = normalizeInventoryPolicy(game.inventoryPolicy).autoEquip ? autoEquipBestGear(game, policy) : game;
  const junk = junkItemsForSale(next, 'all', policy);
  if (junk.length === 0) return next;
  const sold = new Set(junk);
  const gold = junk.reduce((total, item) => total + getSellValue(item, itemQuantity(item)), 0);
  if (!Number.isSafeInteger(gold) || !Number.isSafeInteger(next.inventory.gold + gold)) return next;
  return {
    ...next,
    inventory: { ...next.inventory, gold: next.inventory.gold + gold, items: next.inventory.items.filter((item) => !sold.has(item)) },
    stash: { ...next.stash, items: next.stash.items.filter((item) => !sold.has(item)) },
    activityLog: [`Sold ${junk.length} obsolete equipment item${junk.length === 1 ? '' : 's'} from pack/stash for ${gold}g.`, ...next.activityLog].slice(0, 12),
    updatedAt: new Date().toISOString(),
  };
}

export function stashItem<T extends RosterState>(game: T, itemId: string): T {
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

export function withdrawStashItem<T extends RosterState>(game: T, itemId: string): T {
  const item = game.stash.items.find((candidate) => candidate.id === itemId);
  if (game.mode !== 'town' || !item || ambiguousItemIds(game).has(itemId)) return game;
  const { inventory, accepted } = mergeInventoryItems(game.inventory, [item], false, ambiguousItemIds(game), equippedPackItemIds(game));
  if (accepted.length === 0) return game;
  const next: T = {
    ...game,
    inventory,
    stash: { ...game.stash, items: game.stash.items.filter((candidate) => candidate.id !== itemId) },
    activityLog: [`Withdrew ${itemSummary(item)}.`, ...game.activityLog].slice(0, 12),
    updatedAt: new Date().toISOString(),
  };
  return normalizeInventoryPolicy(game.inventoryPolicy).autoEquip ? autoEquipBestGear(next) : next;
}
