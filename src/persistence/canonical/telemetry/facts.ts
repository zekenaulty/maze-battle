import type { ActorState } from '../../../domain/types';
import type { CanonicalBattle } from '../combat/types';
import { check } from '../validation';
import type { ActorResources, BattleFact, BattleTraceTrigger } from './types';

const resources = ({ hp, mp, level, xp, gold, autoBattle }: ActorState): ActorResources => ({ hp, mp, level, xp, gold, autoBattle });

export function battleFact(event: BattleFact['event'], trigger: BattleTraceTrigger,
  before: CanonicalBattle | null, after: CanonicalBattle | null,
  changes: { partyBefore?: readonly ActorState[]; partyAfter?: readonly ActorState[];
    newlyDefeatedCount?: number; walletGoldDelta?: number; lootAwardCount?: number } = {}): BattleFact {
  const state = after ?? before; check(state, 'missing battle trace state');
  const mode = state.battle.returnMode ?? 'manual';
  check(mode === 'manual' || mode === 'auto-play' || mode === 'waves', 'invalid trace return mode');
  const actors = (changes.partyBefore ?? []).map(actor => {
    const next = changes.partyAfter?.find(a => a.id === actor.id); check(next, 'missing trace party recipient');
    return { id: actor.id, before: resources(actor), after: resources(next) };
  });
  return { kind: 'battle', event, battleId: state.battle.id, origin: state.origin,
    trigger: trigger.kind, actorId: trigger.actorId ?? null, skillId: trigger.skillId ?? null,
    returnMode: mode, status: event === 'won' ? 'won' : state.battle.status,
    round: event === 'won' ? state.battle.round + 1 : state.battle.round, paused: after?.paused ?? false,
    newlyDefeatedCount: changes.newlyDefeatedCount ?? 0,
    pendingGold: { before: before?.battle.rewardGold ?? 0, after: after?.battle.rewardGold ?? 0 },
    pendingLootCount: { before: before?.battle.loot?.length ?? 0, after: after?.battle.loot?.length ?? 0 },
    walletGoldDelta: changes.walletGoldDelta ?? 0, lootAwardCount: changes.lootAwardCount ?? 0, actors };
}
