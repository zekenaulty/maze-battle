import type { Rng } from '../combat/rng';
import { samePosition } from '../maze/key';
import type { RosterState } from '../party/roster';
import type { ChestState, GridPosition, ItemInstance } from '../types';
import { rollLoot } from './loot';

export function canOpenChest(roster: Pick<RosterState, 'battle' | 'mode' | 'party' | 'dungeonLevel'>,
  position: GridPosition, chest: ChestState): boolean {
  return !roster.battle && roster.mode !== 'town' && !roster.party.every(actor => actor.hp <= 0)
    && chest.level === roster.dungeonLevel && !chest.opened && samePosition(chest.position, position);
}

/** Ordinary loot only. Supply itemId as well as rng for deterministic replay, including identities. */
export function rollChestLoot(chest: Pick<ChestState, 'level'>, rng: Rng, itemId?: (index: number) => string): ItemInstance[] {
  const loot = rollLoot({ source: 'chest', level: chest.level }, rng);
  return itemId ? loot.map((item, index) => ({ ...item, id: itemId(index) })) : loot;
}
