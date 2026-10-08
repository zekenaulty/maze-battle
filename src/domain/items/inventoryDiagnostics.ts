import type { GameState } from '../types';
import { ambiguousEquipmentIds } from './itemOwnership';
import { itemQuantity } from './itemStacks';

export function inventoryDiagnostics(game: GameState) {
  const items = [...game.inventory.items, ...game.stash.items];
  return {
    pack: { used: game.inventory.items.length, capacity: game.inventory.capacity },
    stash: { used: game.stash.items.length, capacity: game.stash.capacity },
    ambiguousIds: [...ambiguousEquipmentIds(game)],
    invalidQuantityIds: items.filter(item => itemQuantity(item) === 0).map(item => item.id),
    missingEquipment: game.party.flatMap(actor => Object.entries(actor.equipment)
      .filter(([, id]) => !game.inventory.items.some(item => item.id === id))
      .map(([slot, id]) => ({ actorId: actor.id, slot, itemId: id }))),
  };
}
