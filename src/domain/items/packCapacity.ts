import type { ItemInstance } from '../types';
import type { RosterState } from '../party/roster';
import { isEquipmentItem } from './equipment';
import { ambiguousEquipmentIds } from './itemOwnership';

export type PackCapacityState = Pick<RosterState, 'party' | 'inventory' | 'stash'>;

/** Only a single, valid pack item worn in its matching slot is outside the bag. */
export function equippedPackItemIds(game: PackCapacityState): ReadonlySet<string> {
  const ambiguous = ambiguousEquipmentIds(game);
  const items = new Map(game.inventory.items.map((item) => [item.id, item]));
  const equipped = new Set<string>();
  for (const actor of game.party) {
    for (const [slot, id] of Object.entries(actor.equipment)) {
      const item = items.get(id);
      if (typeof id !== 'string' || id.length === 0 || ambiguous.has(id) || !item) continue;
      if (isEquipmentItem(item) && item.slot === slot && (item.quantity === undefined || item.quantity === 1)) equipped.add(id);
    }
  }
  return equipped;
}

/** Counts existing records/stacks without normalizing, merging or dropping any of them. */
export function occupiedItemSlots(items: readonly ItemInstance[], excludedSlotIds: ReadonlySet<string> = new Set()): number {
  return items.reduce((used, item) => used + Number(!excludedSlotIds.has(item.id)), 0);
}

export function packSlotUsage(game: PackCapacityState): number {
  return occupiedItemSlots(game.inventory.items, equippedPackItemIds(game));
}

/** Legacy overflow may be retained or reduced, but an equipment move cannot worsen it. */
export function canApplyPackChange(before: PackCapacityState, after: PackCapacityState): boolean {
  return packSlotUsage(after) <= Math.max(after.inventory.capacity, packSlotUsage(before));
}
