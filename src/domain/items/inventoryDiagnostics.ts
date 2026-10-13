import type { RosterState } from '../party/roster';
import { ambiguousEquipmentIds } from './itemOwnership';
import { itemQuantity } from './itemStacks';
import { packSlotUsage } from './packCapacity';

export function inventoryDiagnostics(game: Pick<RosterState, 'party' | 'inventory' | 'stash'>) {
  const items = [...game.inventory.items, ...game.stash.items];
  return {
    pack: { used: packSlotUsage(game), capacity: game.inventory.capacity },
    stash: { used: game.stash.items.length, capacity: game.stash.capacity },
    ambiguousIds: [...ambiguousEquipmentIds(game)],
    invalidQuantityIds: items.filter(item => itemQuantity(item) === 0).map(item => item.id),
    missingEquipment: game.party.flatMap(actor => Object.entries(actor.equipment)
      .filter(([, id]) => !game.inventory.items.some(item => item.id === id))
      .map(([slot, id]) => ({ actorId: actor.id, slot, itemId: id }))),
  };
}
