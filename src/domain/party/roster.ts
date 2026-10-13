import type { ActorState, BattleState, GameMode, InventoryPolicy, InventoryState, StashState } from '../types';

/**
 * Shared item and portal state, independent of maze/floor residency.
 * Reducers preserve extra enumerable fields on plain state objects, not invariants
 * that narrow mutable roster fields (for example, a literal mode or fixed party).
 */
export interface RosterState {
  party: ActorState[];
  inventory: InventoryState;
  stash: StashState;
  inventoryPolicy?: InventoryPolicy;
  mode: GameMode;
  townReturnMode?: 'manual' | 'auto-play' | 'waves';
  battle?: BattleState;
  dungeonLevel: number;
  updatedAt: string;
  activityLog: string[];
}
