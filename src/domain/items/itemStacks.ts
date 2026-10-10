import type { ItemInstance } from '../types';
import { duplicateItemIds } from './itemOwnership';
import { getSellValue } from './itemValue';
import { occupiedItemSlots } from './packCapacity';
import { itemQuantity } from './itemQuantity';

export { itemQuantity } from './itemQuantity';

export interface ItemContainer {
  capacity: number;
  items: ItemInstance[];
}

export function isStackableItem(item: ItemInstance): boolean {
  return !item.slot && item.category === 'consumable' && Boolean(item.consumableEffect);
}

export function stackInventoryItems(items: ItemInstance[], protectedIds: ReadonlySet<string> = new Set()): ItemInstance[] {
  const stacked: ItemInstance[] = [];
  const indices = new Map<string, number>();
  const ambiguous = duplicateItemIds(items);
  for (const item of items) {
    const key = canStack(item) && !ambiguous.has(item.id) && !protectedIds.has(item.id) ? stackIdentity(item) : undefined;
    const index = key === undefined ? undefined : indices.get(key);
    if (index !== undefined && canCombine(stacked[index], item)) {
      const existing = stacked[index];
      stacked[index] = combineStacks(existing, item);
    } else {
      if (key !== undefined) indices.set(key, stacked.length);
      stacked.push(key === undefined ? item : { ...item, quantity: itemQuantity(item) });
    }
  }
  return stacked;
}

// Capacity limits admission, never normalization of already-owned items.
export function mergeInventoryItems<T extends ItemContainer>(container: T, incoming: ItemInstance[], allowOverflow = false, protectedIds: ReadonlySet<string> = new Set(), excludedSlotIds: ReadonlySet<string> = new Set()) {
  const ambiguous = new Set([...protectedIds, ...duplicateItemIds([...container.items, ...incoming])]);
  const items = stackInventoryItems(container.items, ambiguous);
  const accepted: ItemInstance[] = [];
  const rejected: ItemInstance[] = [];
  for (const item of incoming) {
    const usable = itemQuantity(item) > 0 && !ambiguous.has(item.id);
    if (!usable && !allowOverflow) { rejected.push(item); continue; }
    const index = usable && canStack(item)
      ? items.findIndex((candidate) => !ambiguous.has(candidate.id) && canStack(candidate)
        && canCombine(candidate, item) && stackIdentity(candidate) === stackIdentity(item))
      : -1;
    if (index >= 0) {
      items[index] = combineStacks(items[index], item);
    } else if (allowOverflow || occupiedItemSlots(items, excludedSlotIds) + Number(!excludedSlotIds.has(item.id)) <= container.capacity) {
      items.push(usable && isStackableItem(item) ? { ...item, quantity: itemQuantity(item) } : item);
    } else {
      rejected.push(item);
      continue;
    }
    accepted.push(item);
  }
  return { inventory: { ...container, items }, accepted, rejected };
}

export function consumeStackItem(items: ItemInstance[], itemId: string, amount = 1): ItemInstance[] {
  const matches = items.filter((item) => item.id === itemId);
  if (matches.length !== 1 || !Number.isSafeInteger(amount) || amount <= 0 || itemQuantity(matches[0]) < amount) return items;
  return items.flatMap((item) => {
    if (item.id !== itemId) return [item];
    const quantity = itemQuantity(item) - amount;
    const stackSellValue = item.stackSellValue === undefined || getSellValue(item, itemQuantity(item)) === 0
      ? undefined : item.stackSellValue - getSellValue(item, amount);
    return quantity > 0 ? [{ ...item, quantity, ...(stackSellValue === undefined ? {} : { stackSellValue }) }] : [];
  });
}

export function normalizeCapacity(capacity: number | undefined, fallback: number): number {
  return capacity !== undefined && Number.isFinite(capacity) ? Math.max(0, Math.floor(capacity)) : fallback;
}

export function stackIdentity(item: ItemInstance, includeLock = true): string {
  // Level and price do not change potency. Preserve all other metadata boundaries.
  const { id: _id, quantity: _quantity, itemLevel: _level, value: _value, stackSellValue: _total, locked, ...identity } = item;
  return JSON.stringify({ ...identity, ...(includeLock ? { locked: Boolean(locked) } : {}) }, (_key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
    }
    return value;
  });
}

function canStack(item: ItemInstance): boolean {
  return isStackableItem(item) && itemQuantity(item) > 0 && getSellValue(item, itemQuantity(item)) > 0;
}

function canCombine(left: ItemInstance, right: ItemInstance): boolean {
  return Number.isSafeInteger(itemQuantity(left) + itemQuantity(right))
    && Number.isSafeInteger(getSellValue(left, itemQuantity(left)) + getSellValue(right, itemQuantity(right)));
}

function combineStacks(left: ItemInstance, right: ItemInstance): ItemInstance {
  const quantity = itemQuantity(left) + itemQuantity(right);
  const total = getSellValue(left, itemQuantity(left)) + getSellValue(right, itemQuantity(right));
  return { ...left, quantity, ...(left.value === right.value && left.stackSellValue === undefined && right.stackSellValue === undefined ? {} : { stackSellValue: total }) };
}
