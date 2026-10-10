import type { ItemInstance } from '../../domain/types';
import type { PackCapacityState } from '../../domain/items/packCapacity';
import { ambiguousItemIds, equippedPackItemIds } from '../../domain/items/inventory';
import { mergeInventoryItems } from '../../domain/items/itemStacks';

// Preview strict domain admission without changing the owned inventory.
export function canReceiveTownItem(game: PackCapacityState, item: ItemInstance, destination: 'pack' | 'stash' = 'pack') {
  const pack = destination === 'pack';
  return mergeInventoryItems(pack ? game.inventory : game.stash, [item], false, ambiguousItemIds(game), pack ? equippedPackItemIds(game) : undefined).accepted.length > 0;
}
