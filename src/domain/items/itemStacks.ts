import type { ItemInstance } from '../types';

export interface ItemContainer {
  capacity: number;
  items: ItemInstance[];
}

export function itemQuantity(item: ItemInstance): number {
  const quantity = item.quantity ?? 1;
  return Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 1;
}

export function isStackableItem(item: ItemInstance): boolean {
  return !item.slot && item.category === 'consumable' && Boolean(item.consumableEffect);
}

export function stackInventoryItems(items: ItemInstance[]): ItemInstance[] {
  const stacked: ItemInstance[] = [];
  const indices = new Map<string, number>();
  for (const item of items) {
    if (itemQuantity(item) === 0) continue;
    const key = isStackableItem(item) ? stackKey(item) : undefined;
    const index = key === undefined ? undefined : indices.get(key);
    if (index !== undefined) {
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
export function mergeInventoryItems<T extends ItemContainer>(container: T, incoming: ItemInstance[], allowOverflow = false) {
  const items = stackInventoryItems(container.items);
  const accepted: ItemInstance[] = [];
  const rejected: ItemInstance[] = [];
  for (const item of incoming) {
    if (itemQuantity(item) === 0) continue;
    const index = isStackableItem(item)
      ? items.findIndex((candidate) => isStackableItem(candidate) && stackKey(candidate) === stackKey(item))
      : -1;
    if (index >= 0) {
      items[index] = { ...items[index], quantity: itemQuantity(items[index]) + itemQuantity(item) };
    } else if (allowOverflow || items.length < container.capacity) {
      items.push(isStackableItem(item) ? { ...item, quantity: itemQuantity(item) } : item);
    } else {
      rejected.push(item);
      continue;
    }
    accepted.push(item);
  }
  return { inventory: { ...container, items }, accepted, rejected };
}

export function consumeStackItem(items: ItemInstance[], itemId: string, amount = 1): ItemInstance[] {
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
