import type { ItemInstance } from '../domain/types';
import { getSellValue } from '../domain/items/inventory';
import { itemQuantity } from '../domain/items/itemStacks';

export const getStackSellValue = getSellValue;

export function saleDisabledReason(item: ItemInstance, equipped = false, ambiguous = false) {
  if (ambiguous) return 'Duplicate item identity';
  if (equipped) return 'Unequip before selling';
  if (item.locked) return 'Unlock before selling';
  if (item.category !== 'equipment' && item.category !== 'consumable') return 'Not sellable';
  if (itemQuantity(item) === 0) return 'Invalid stack quantity';
  const total = item.stackSellValue;
  if (!Number.isFinite(item.value) || item.value < 0 || total !== undefined && (!Number.isSafeInteger(total) || total < itemQuantity(item))) return 'Invalid sale value';
  return undefined;
}
