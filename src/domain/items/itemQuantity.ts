import type { ItemInstance } from '../types';

export function itemQuantity(item: ItemInstance): number {
  const quantity = item.quantity === undefined ? 1 : item.quantity;
  return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 0;
}
