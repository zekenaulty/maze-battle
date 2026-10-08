import type { ItemInstance } from '../../domain/types';
import { mergeInventoryItems } from '../../domain/items/itemStacks';

// Preview strict domain admission without changing the owned inventory.
export function canReceiveTownItem(container: { capacity: number; items: ItemInstance[] }, item: ItemInstance) {
  return mergeInventoryItems(container, [item]).accepted.length > 0;
}
