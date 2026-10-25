import type { GameCheckpoint } from '../game/checkpoint';
import type { CanonicalPages } from '../pages';
import { check } from '../validation';
import { same } from '../world/records';
import { loadBattle } from './records';
import type { CanonicalBattle } from './types';

export function battleCoherence(checkpoint: GameCheckpoint, current: CanonicalBattle | null) {
  if (!current) { check(checkpoint.mode !== 'battle', 'battle checkpoint has no battle'); return; }
  check(same(current.origin, checkpoint.position), 'battle origin differs from checkpoint position');
  check(current.battle.status === 'active' ? checkpoint.mode === 'battle'
    : current.battle.status === 'lost' && checkpoint.mode === 'manual', 'battle status differs from checkpoint mode');
}
export async function currentBattle(pages: Pick<CanonicalPages, 'get'>, checkpoint: GameCheckpoint) {
  const current = await loadBattle(pages); battleCoherence(checkpoint, current); return current;
}
