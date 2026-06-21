import type { GameState, VendorId } from '../types';
import { BASE_ITEMS } from '../items/catalog';
import { buyVendorItem, recoverParty } from '../items/inventory';

export function enterTown(game: GameState): GameState {
  if (game.mode === 'town') {
    return game;
  }

  return {
    ...game,
    mode: 'town',
    battle: undefined,
    activityLog: trimLog(['Returned to town.', ...game.activityLog]),
    updatedAt: new Date().toISOString(),
  };
}

export function leaveTown(game: GameState): GameState {
  if (game.mode !== 'town') {
    return game;
  }

  return {
    ...game,
    mode: 'manual',
    activityLog: trimLog(['Left town.', ...game.activityLog]),
    updatedAt: new Date().toISOString(),
  };
}

export function useInn(game: GameState): GameState {
  return recoverParty(game);
}

export function buyFromVendor(game: GameState, vendor: VendorId, baseId: string): GameState {
  const item = BASE_ITEMS.find((candidate) => candidate.id === baseId && candidate.vendors?.includes(vendor));
  return item ? buyVendorItem(game, baseId) : game;
}

export function vendorStock(vendor: VendorId, level: number) {
  return BASE_ITEMS.filter((item) => item.vendors?.includes(vendor) && item.minLevel <= Math.max(1, level + 1));
}

function trimLog(entries: string[]) {
  return entries.slice(0, 12);
}
