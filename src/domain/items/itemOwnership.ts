import type { GameState, ItemInstance } from '../types';

/** Identity collisions are not duplicates we can safely discard or silently rename. */
export function duplicateItemIds(items: readonly ItemInstance[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) duplicates.add(item.id);
    seen.add(item.id);
  }
  return duplicates;
}

export function ambiguousItemIds(game: Pick<GameState, 'inventory' | 'stash'>): Set<string> {
  return duplicateItemIds([...game.inventory.items, ...game.stash.items]);
}

/** Also pin an item referenced by more than one equipment slot/hero. */
export function ambiguousEquipmentIds(game: GameState): Set<string> {
  const ids = ambiguousItemIds(game);
  const seen = new Set<string>();
  for (const actor of game.party) {
    for (const id of Object.values(actor.equipment)) {
      if (seen.has(id)) ids.add(id);
      seen.add(id);
    }
  }
  return ids;
}
