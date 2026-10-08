import type { ItemInstance } from '../types';
import { duplicateItemIds } from './itemOwnership';

export interface ItemContainer {
  capacity: number;
  items: ItemInstance[];
}

export function itemQuantity(item: ItemInstance): number {
  const quantity = item.quantity === undefined ? 1 : item.quantity;
  return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 0;
}

export function isStackableItem(item: ItemInstance): boolean {
  return !item.slot && item.category === 'consumable' && Boolean(item.consumableEffect);
}

export function stackInventoryItems(items: ItemInstance[], protectedIds: ReadonlySet<string> = new Set()): ItemInstance[] {
  const stacked: ItemInstance[] = [];
  const indices = new Map<string, number>();
  const ambiguous = duplicateItemIds(items);
  for (const item of items) {
    const key = itemQuantity(item) > 0 && !ambiguous.has(item.id) && !protectedIds.has(item.id) && isStackableItem(item) ? stackKey(item) : undefined;
    const index = key === undefined ? undefined : indices.get(key);
    if (index !== undefined && Number.isSafeInteger(itemQuantity(stacked[index]) + itemQuantity(item))) {
      const existing = stacked[index];
      stacked[index] = { ...existing, quantity: itemQuantity(existing) + itemQuantity(item) };
    } else {
      if (key !== undefined) indices.set(key, stacked.length);
      stacked.push(key === undefined ? item : { ...item, quantity: itemQuantity(item) });
    }
  }
  return stacked;
}

// Capacity limits admission, never normalization of already-owned items.
export function mergeInventoryItems<T extends ItemContainer>(container: T, incoming: ItemInstance[], allowOverflow = false, protectedIds: ReadonlySet<string> = new Set()) {
  const ambiguous = new Set([...protectedIds, ...duplicateItemIds([...container.items, ...incoming])]);
  const items = stackInventoryItems(container.items, ambiguous);
  const accepted: ItemInstance[] = [];
  const rejected: ItemInstance[] = [];
  for (const item of incoming) {
    const usable = itemQuantity(item) > 0 && !ambiguous.has(item.id);
    if (!usable && !allowOverflow) { rejected.push(item); continue; }
    const index = usable && isStackableItem(item)
      ? items.findIndex((candidate) => !ambiguous.has(candidate.id) && itemQuantity(candidate) > 0 && isStackableItem(candidate)
        && Number.isSafeInteger(itemQuantity(candidate) + itemQuantity(item)) && stackKey(candidate) === stackKey(item))
      : -1;
    if (index >= 0) {
      items[index] = { ...items[index], quantity: itemQuantity(items[index]) + itemQuantity(item) };
    } else if (allowOverflow || items.length < container.capacity) {
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
    return quantity > 0 ? [{ ...item, quantity }] : [];
  });
}

export function normalizeCapacity(capacity: number | undefined, fallback: number): number {
  return capacity !== undefined && Number.isFinite(capacity) ? Math.max(0, Math.floor(capacity)) : fallback;
}

function stackKey(item: ItemInstance): string {
  // Keep value, effects, metadata and lock boundaries intact; the first ID wins.
  const { id: _id, quantity: _quantity, locked, ...identity } = item;
  return JSON.stringify({ ...identity, locked: Boolean(locked) }, (_key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
    }
    return value;
  });
}
