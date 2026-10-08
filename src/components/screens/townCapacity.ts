import type { ItemInstance } from '../../domain/types';
import { normalizeInventory } from '../../domain/items/inventory';

// Reuse the domain's stack normalization rather than maintaining a second stack-key rule.
export function canReceiveTownItem(container: { capacity: number; items: ItemInstance[] }, item: ItemInstance) {
  if (container.items.length < container.capacity) return true;
  const count = (items: ItemInstance[]) => items.reduce((sum, entry) => sum + Math.max(1, Math.floor(entry.quantity ?? 1)), 0);
  const before = normalizeInventory({ ...container, gold: 0 });
  const after = normalizeInventory({ ...container, gold: 0, items: [...container.items, item] });
  return count(after.items) > count(before.items);
}
