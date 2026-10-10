import type { ConsumableEffect, GameState, InventoryPolicy, ItemInstance } from '../types';
import { isEquipmentItem, isItemEquipped } from './equipment';
import { autoEquipBestGear } from './equipmentOptimizer';
import { BALANCED_GEAR_POLICY, retainGearForParty, type GearEvaluationPolicy } from './gearEvaluation';
import { ambiguousItemIds } from './itemOwnership';
import { normalizeInventoryPolicy, setInventoryPolicy } from './inventoryPolicy';
import { buyVendorItem, sellJunkItems, stashItem } from './inventoryTrade';
import { consumeStackItem, itemQuantity, mergeInventoryItems, stackInventoryItems } from './itemStacks';
import { stackPortion } from './itemValue';
import { equippedPackItemIds } from './packCapacity';

const SUPPLIES: Array<{ effect: ConsumableEffect; baseId: string; reserve: keyof Pick<InventoryPolicy, 'portalReserve' | 'healthReserve' | 'manaReserve'> }> = [
  { effect: 'townPortal', baseId: 'town-portal', reserve: 'portalReserve' },
  { effect: 'heal', baseId: 'health-herb', reserve: 'healthReserve' },
  { effect: 'mana', baseId: 'mana-vial', reserve: 'manaReserve' },
];

/** One bounded, repeat-safe pass. No travel, combat, healing or autonomous timer. */
export function manageAutoInventory(game: GameState, gearPolicy: GearEvaluationPolicy = BALANCED_GEAR_POLICY): GameState {
  const policy = normalizeInventoryPolicy(game.inventoryPolicy);
  let next = compactContainers(setInventoryPolicy(game, policy));
  if (next.mode !== 'town') return policy.autoEquip ? autoEquipBestGear(next, gearPolicy) : next;
  // Cleanup can free the bag slot needed to return old worn gear during a stash upgrade.
  for (let pass = 0; pass < 2; pass++) {
    if (policy.autoSellJunk) next = sellJunkItems(next, gearPolicy);
    else if (policy.autoEquip) next = autoEquipBestGear(next, gearPolicy);
    if (policy.autoStash) next = stashSurplus(next, policy, gearPolicy);
  }
  if (policy.autoRestock) next = restockSupplies(next, policy, gearPolicy);
  return next;
}

/** Counts usable, unlocked pack supplies, not stash stock or empty stacks. */
export function consumableCount(game: GameState, effect: ConsumableEffect): number {
  const ambiguous = ambiguousItemIds(game);
  return game.inventory.items.filter((item) => !ambiguous.has(item.id) && usableSupply(item, effect)).reduce((total, item) => total + itemQuantity(item), 0);
}

function usableSupply(item: ItemInstance, effect: ConsumableEffect): boolean {
  return !item.slot && !item.locked && item.category === 'consumable' && item.consumableEffect === effect
    && (effect === 'townPortal' || (Number.isFinite(item.consumableAmount) && (item.consumableAmount ?? 0) > 0));
}

function compactContainers(game: GameState): GameState {
  const ambiguous = ambiguousItemIds(game);
  const pack = stackInventoryItems(game.inventory.items, ambiguous);
  const stash = stackInventoryItems(game.stash.items, ambiguous);
  if (JSON.stringify(pack) === JSON.stringify(game.inventory.items) && JSON.stringify(stash) === JSON.stringify(game.stash.items)) return game;
  return {
    ...game,
    inventory: { ...game.inventory, items: pack },
    stash: { ...game.stash, items: stash },
    updatedAt: new Date().toISOString(),
  };
}

function stashSurplus(game: GameState, policy: InventoryPolicy, gearPolicy: GearEvaluationPolicy): GameState {
  let next = game;
  for (const item of game.inventory.items) {
    if (!isEquipmentItem(item) || item.locked || isItemEquipped(next, item.id)) continue;
    if (retainGearForParty(next.party, item, [...next.inventory.items, ...next.stash.items], gearPolicy)) continue;
    next = stashItem(next, item.id);
  }
  for (const supply of SUPPLIES) {
    for (const item of next.inventory.items.filter((candidate) => usableSupply(candidate, supply.effect))) {
      const excess = consumableCount(next, supply.effect) - policy[supply.reserve];
      if (excess <= 0) break;
      next = transferSupply(next, item, Math.min(excess, itemQuantity(item)), 'stash');
    }
  }
  return next;
}

function restockSupplies(game: GameState, policy: InventoryPolicy, gearPolicy: GearEvaluationPolicy): GameState {
  let next = game;
  for (const supply of SUPPLIES) {
    for (const item of next.stash.items.filter((candidate) => usableSupply(candidate, supply.effect))) {
      const needed = policy[supply.reserve] - consumableCount(next, supply.effect);
      if (needed <= 0) break;
      next = transferSupply(next, item, Math.min(needed, itemQuantity(item)), 'pack');
    }
    const needed = policy[supply.reserve] - consumableCount(next, supply.effect);
    for (let count = 0; count < needed; count++) {
      const bought = buyVendorItem(next, supply.baseId, gearPolicy);
      if (bought === next) break;
      next = bought;
    }
    // Keep remaining gold for an escape scroll if even the minimum stock could not be funded.
    if (supply.effect === 'townPortal' && consumableCount(next, 'townPortal') === 0) break;
  }
  return next;
}

function transferSupply(game: GameState, item: ItemInstance, quantity: number, destination: 'pack' | 'stash'): GameState {
  if (quantity <= 0 || ambiguousItemIds(game).has(item.id)) return game;
  const moved = { ...stackPortion(item, quantity), id: quantity === itemQuantity(item) ? item.id : crypto.randomUUID() };
  const target = destination === 'pack' ? game.inventory : game.stash;
  const { inventory: merged, accepted } = mergeInventoryItems(target, [moved], false, ambiguousItemIds(game), destination === 'pack' ? equippedPackItemIds(game) : undefined);
  if (accepted.length === 0) return game;
  return {
    ...game,
    inventory: destination === 'pack' ? { ...game.inventory, items: merged.items }
      : { ...game.inventory, items: consumeStackItem(game.inventory.items, item.id, quantity) },
    stash: destination === 'stash' ? merged
      : { ...game.stash, items: consumeStackItem(game.stash.items, item.id, quantity) },
    activityLog: [`${destination === 'pack' ? 'Withdrew' : 'Stashed'} ${quantity} ${item.displayName}.`, ...game.activityLog].slice(0, 12),
    updatedAt: new Date().toISOString(),
  };
}
