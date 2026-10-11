import type { GameState, ItemInstance } from '../types';
import { consumeStackItem, itemQuantity } from '../items/itemStacks';
import { ambiguousItemIds } from '../items/itemOwnership';

function availableScroll(item: ItemInstance): boolean {
  return item.category === 'consumable' && !item.slot && item.consumableEffect === 'townPortal' && !item.locked && itemQuantity(item) > 0;
}

/** Available pack stock only: locked scrolls and stash stock cannot fund a portal. */
export function portalScrollCount(game: GameState): number {
  const ambiguous = ambiguousItemIds(game);
  return game.inventory.items.filter((item) => !ambiguous.has(item.id) && availableScroll(item)).reduce((total, item) => total + itemQuantity(item), 0);
}

/** Portals cannot escape combat, defeat, or an existing town visit. Stairs are separate. */
export function canUseTownPortal(game: GameState): boolean {
  return (game.mode === 'manual' || game.mode === 'auto-play' || game.mode === 'waves')
    && game.battle?.status !== 'active'
    && game.party.some((actor) => actor.hp > 0)
    && portalScrollCount(game) > 0;
}

/** Optional itemId lets a pack action consume that exact stack; toolbar use selects the first. */
export function useTownPortal(game: GameState, itemId?: string): GameState {
  if (!canUseTownPortal(game)) return game;
  const ambiguous = ambiguousItemIds(game);
  const scroll = game.inventory.items.find((item) => !ambiguous.has(item.id) && availableScroll(item) && (itemId === undefined || item.id === itemId));
  if (!scroll) return game;
  const townReturnMode = game.mode === 'auto-play' || game.mode === 'waves' ? game.mode : 'manual';
  return {
    ...game,
    mode: 'town',
    townReturnMode,
    battle: undefined,
    inventory: { ...game.inventory, items: consumeStackItem(game.inventory.items, scroll.id) },
    activityLog: ['Town portal opened.', ...game.activityLog].slice(0, 12),
    updatedAt: new Date().toISOString(),
  };
}
