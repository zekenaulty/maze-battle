import type { BattleState, EnemyState, ItemInstance } from '../../../domain/types';
import type { WorldPosition } from '../world/types';

export interface CanonicalBattle {
  schema: 1;
  battle: Omit<BattleState, 'origin'>;
  origin: WorldPosition;
  stalledTicks: number;
}

export interface BattleHeader extends Omit<CanonicalBattle, 'battle'> {
  battle: Omit<BattleState, 'origin' | 'enemies' | 'defeated' | 'loot'> & {
    enemyIds: string[];
    defeatedIds?: string[];
    lootIds?: string[];
  };
}
export interface BattleEnemy { schema: 1; battleId: string; enemy: EnemyState }
export interface BattleLoot { schema: 1; battleId: string; item: ItemInstance }
export interface BattleRows {
  header: BattleHeader;
  enemies: Map<string, BattleEnemy>;
  loot: Map<string, BattleLoot>;
}

export const MAX_BATTLE_ENEMIES = 10;
export const MAX_BATTLE_LOOT = 20;
export const MAX_BATTLE_LOG = 20;
