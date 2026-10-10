import type { GameState, VendorId } from '../types';
import { BASE_ITEMS } from '../items/catalog';
import { buyVendorItem, manageAutoInventory, recoverParty } from '../items/inventory';
import { useTownPortal } from './portal';

export { canUseTownPortal, portalScrollCount, useTownPortal } from './portal';

export function enterTown(game: GameState): GameState {
  return useTownPortal(game);
}

export function leaveTown(game: GameState): GameState {
  if (game.mode !== 'town') {
    return game;
  }

  return {
    ...game,
    mode: game.townReturnMode === 'auto-play' || game.townReturnMode === 'waves' ? game.townReturnMode : 'manual',
    townReturnMode: undefined,
    activityLog: trimLog(['Left town.', ...game.activityLog]),
    updatedAt: new Date().toISOString(),
  };
}

export function useInn(game: GameState): GameState {
  return game.mode === 'town' ? recoverParty(game) : game;
}

/** Call on town arrival; unchanged repeat calls do not spend, move stock or add logs. */
export function maintainTown(game: GameState): GameState {
  return game.mode === 'town' ? recoverParty(manageAutoInventory(game)) : game;
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
