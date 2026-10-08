import type { ItemInstance } from '../domain/types';
import { getSellValue } from '../domain/items/inventory';
import { itemQuantity } from '../domain/items/itemStacks';

// Integration owns the amount-aware domain implementation; never derive stack prices here.
export const getStackSellValue: (item: ItemInstance, amount?: number) => number = getSellValue;

export function saleDisabledReason(item: ItemInstance, equipped = false, ambiguous = false) {
  if (ambiguous) return 'Duplicate item identity';
  if (equipped) return 'Unequip before selling';
  if (item.locked) return 'Unlock before selling';
  if (item.category !== 'equipment' && item.category !== 'consumable') return 'Not sellable';
  if (itemQuantity(item) === 0) return 'Invalid stack quantity';
  const total = (item as ItemInstance & { stackSellValue?: number }).stackSellValue;
  if (!Number.isFinite(item.value) || item.value < 0 || total !== undefined && (!Number.isFinite(total) || total < 0)) return 'Invalid sale value';
  return undefined;
}
