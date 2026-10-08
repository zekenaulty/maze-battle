import type { GameState, ItemInstance } from '../types';
import { findBaseItem, itemSummary } from './catalog';
import { clampActorVitals, isItemEquipped, removeItemFromEquipment } from './equipment';
import { autoEquipBestGear } from './equipmentOptimizer';
import { getGearUpgradeScore } from './gearScore';
import { normalizeInventoryPolicy } from './inventoryPolicy';
import { consumeStackItem, itemQuantity, mergeInventoryItems } from './itemStacks';
import { createVendorItem } from './loot';

export function buyVendorItem(game: GameState, baseId: string): GameState {
  const base = findBaseItem(baseId);
  if (game.mode !== 'town' || !base || !Number.isFinite(game.inventory.gold) || game.inventory.gold < base.value) return game;
  // Consumable potency does not scale with floor; fixed vendor level keeps repeat purchases stackable.
  const item = createVendorItem(baseId, base.slot ? game.dungeonLevel : 1);
  const { inventory, accepted } = mergeInventoryItems(game.inventory, [item]);
  if (accepted.length === 0) return game;
  const next: GameState = {
    ...game,
    inventory: { ...inventory, gold: game.inventory.gold - base.value },
    activityLog: [`Bought ${item.displayName}.`, ...game.activityLog].slice(0, 12),
    updatedAt: new Date().toISOString(),
  };
  return normalizeInventoryPolicy(game.inventoryPolicy).autoEquip ? autoEquipBestGear(next) : next;
}

export function getSellValue(item: ItemInstance): number {
  return Number.isFinite(item.value) ? Math.max(1, Math.ceil(item.value * 0.5)) : 0;
}

export function sellItem(game: GameState, itemId: string): GameState {
  const item = game.inventory.items.find((candidate) => candidate.id === itemId);
  if (game.mode !== 'town' || !item || item.locked || itemQuantity(item) === 0) return game;
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

export function junkItemsForSale(game: GameState): ItemInstance[] {
  return game.inventory.items.filter((item) => item.slot && !item.locked && !isItemEquipped(game, item.id)
    && item.rarity !== 'rare' && item.rarity !== 'legendary' && !item.legendaryPower
    && game.party.length > 0 && game.party.every((actor) => getGearUpgradeScore(item, actor, game.inventory.items) <= 0));
}

export function sellJunkItems(game: GameState): GameState {
  if (game.mode !== 'town') return game;
  const junk = junkItemsForSale(game);
  if (junk.length === 0) return game;
  const ids = new Set(junk.map((item) => item.id));
  const gold = junk.reduce((total, item) => total + getSellValue(item) * itemQuantity(item), 0);
  return {
    ...game,
    inventory: { ...game.inventory, gold: game.inventory.gold + gold, items: game.inventory.items.filter((item) => !ids.has(item.id)) },
    activityLog: [`Sold ${junk.length} junk item${junk.length === 1 ? '' : 's'} for ${gold}g.`, ...game.activityLog].slice(0, 12),
    updatedAt: new Date().toISOString(),
  };
}

export function stashItem(game: GameState, itemId: string): GameState {
  const item = game.inventory.items.find((candidate) => candidate.id === itemId);
  if (game.mode !== 'town' || !item || item.locked || isItemEquipped(game, item.id)) return game;
  const { inventory: stash, accepted } = mergeInventoryItems(game.stash, [item]);
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
  if (game.mode !== 'town' || !item) return game;
  const { inventory, accepted } = mergeInventoryItems(game.inventory, [item]);
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
