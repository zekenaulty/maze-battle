import type { ActorState, EquipmentSlot, InventoryState, ItemCategory, ItemRarity } from '../domain/types';
import { getItemTooltip } from '../domain/items/itemDetails';
import { getSellValue } from '../domain/items/inventory';
import { compareItem, getEquippedItemOwner } from './inventoryComparison';

export interface InventoryFilters {
  query: string;
  category: 'all' | ItemCategory;
  slot: 'all' | EquipmentSlot;
  rarity: 'all' | ItemRarity;
  ownership: 'all' | 'selected' | 'equipped' | 'unequipped' | 'locked' | 'upgrades';
  sort: 'name' | 'score' | 'upgrade' | 'value' | 'level' | 'rarity';
}

export const DEFAULT_INVENTORY_FILTERS: InventoryFilters = { query: '', category: 'all', slot: 'all', rarity: 'all', ownership: 'all', sort: 'name' };
const RARITY_RANK: Record<ItemRarity, number> = { common: 0, magic: 1, rare: 2, legendary: 3 };

export function projectInventory(inventory: InventoryState, party: ActorState[], selectedActor: ActorState, filters: InventoryFilters) {
  const terms = filters.query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const rows = inventory.items.map((item) => ({
    item,
    owner: getEquippedItemOwner(item.id, party),
    comparison: compareItem(item, selectedActor, inventory),
    sellValue: getSellValue(item),
  })).filter(({ item, owner, comparison }) => {
    if (filters.category !== 'all' && item.category !== filters.category) return false;
    if (filters.slot !== 'all' && item.slot !== filters.slot) return false;
    if (filters.rarity !== 'all' && item.rarity !== filters.rarity) return false;
    if (filters.ownership === 'selected' && owner?.actor.id !== selectedActor.id) return false;
    if (filters.ownership === 'equipped' && !owner) return false;
    if (filters.ownership === 'unequipped' && owner) return false;
    if (filters.ownership === 'locked' && !item.locked) return false;
    if (filters.ownership === 'upgrades' && (!comparison || comparison.scoreDelta <= 0)) return false;
    const text = [item.displayName, item.category, item.slot, item.rarity, item.consumableEffect, getItemTooltip(item), owner?.actor.displayName].filter(Boolean).join(' ').toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
  return rows.sort((a, b) => {
    let delta = 0;
    switch (filters.sort) {
      case 'score': delta = (b.comparison?.score ?? 0) - (a.comparison?.score ?? 0); break;
      case 'upgrade': delta = (b.comparison?.scoreDelta ?? -Infinity) - (a.comparison?.scoreDelta ?? -Infinity); break;
      case 'value': delta = b.sellValue - a.sellValue; break;
      case 'level': delta = b.item.itemLevel - a.item.itemLevel; break;
      case 'rarity': delta = RARITY_RANK[b.item.rarity] - RARITY_RANK[a.item.rarity]; break;
    }
    return delta || a.item.displayName.localeCompare(b.item.displayName) || a.item.id.localeCompare(b.item.id);
  });
}

export type InventoryRow = ReturnType<typeof projectInventory>[number];
