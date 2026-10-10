import type { ItemInstance } from '../types';
import { itemQuantity } from './itemQuantity';

/** Exact integer quote; residual gold stays in the remaining units. */
export function getSellValue(item: ItemInstance, amount = 1): number {
  const quantity = itemQuantity(item);
  if (quantity === 0 || !Number.isSafeInteger(amount) || amount <= 0 || amount > quantity) return 0;
  if (!Number.isFinite(item.value) || item.value < 0) return 0;
  const total = item.stackSellValue === undefined ? Math.max(1, Math.ceil(item.value * 0.5)) * quantity : item.stackSellValue;
  if (!Number.isSafeInteger(total) || total < quantity) return 0;
  const unit = Math.floor(total / quantity);
  const cheaperUnits = quantity - total % quantity;
  return unit * amount + Math.max(0, amount - cheaperUnits);
}

/** Split the same leading units that consumeStackItem removes. */
export function stackPortion(item: ItemInstance, quantity: number): ItemInstance {
  return {
    ...item, quantity,
    ...(item.stackSellValue === undefined || getSellValue(item, itemQuantity(item)) === 0 ? {} : { stackSellValue: getSellValue(item, quantity) }),
  };
}
