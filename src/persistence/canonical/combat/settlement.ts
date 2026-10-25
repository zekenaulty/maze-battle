import type { BattleTurnResult } from '../../../domain/combat/battleTurn';
import { MAX_STALLED_COMBAT_TICKS } from '../../../domain/automation/autopilotCombat';
import { addItemsToInventory } from '../../../domain/items/inventory';
import type { GameCheckpoint } from '../game/checkpoint';
import { checkpointJson } from '../game/checkpoint';
import type { RosterSnapshot } from '../roster/types';
import { saveRoster } from '../roster/write';
import type { CanonicalWork } from '../transaction';
import { check } from '../validation';
import { recordBattleKills } from './killProgress';
import { saveBattle } from './records';
import type { CanonicalBattle } from './types';
import { encodeBattle } from './validation';
import { recordGameplay } from '../telemetry/records';
import { battleFact } from '../telemetry/facts';
import type { BattleTraceTrigger } from '../telemetry/types';

export async function settleBattleTurn(tx: CanonicalWork, checkpoint: GameCheckpoint, before: CanonicalBattle,
  roster: RosterSnapshot, turn: BattleTurnResult, now: string, trigger: BattleTraceTrigger = { kind: 'round' }) {
  const { context, status, acted } = turn;
  const committed = acted || status !== 'active';
  const previousHp = before.battle.enemies.reduce((sum, e) => sum + e.hp, 0);
  const stalledTicks = before.battle.returnMode === 'auto-play'
    ? (committed && context.enemies.reduce((sum, e) => sum + e.hp, 0) < previousHp ? 0 : before.stalledTicks + 1) : before.stalledTicks;
  if (!committed) {
    if (stalledTicks === before.stalledTicks) return false;
    const blocked = stalledTicks >= MAX_STALLED_COMBAT_TICKS;
    const next = { ...before, stalledTicks, ...(blocked ? { paused: true } : {}) };
    await saveBattle(tx.pages, before, next);
    if (blocked && !before.paused) await recordGameplay(tx, battleFact('stalled', trigger, before, next), now);
    return true;
  }
  const nextBattle: CanonicalBattle = { ...before, stalledTicks, paused: Boolean(before.paused || status === 'lost' || stalledTicks >= MAX_STALLED_COMBAT_TICKS),
    battle: { ...before.battle, status, round: before.battle.round + 1, enemies: context.enemies, defeated: context.defeated,
      rewardGold: context.rewardGold, loot: context.loot, log: (status === 'lost' ? [...context.log, 'Party defeated.'] : context.log).slice(-20) } };
  encodeBattle(nextBattle);
  await recordBattleKills(tx.pages, before.origin, turn.newlyDefeated, now);
  let next = { ...roster.state, party: context.party, updatedAt: now };
  if (status === 'won') {
    const owned = new Set([...next.inventory.items, ...next.stash.items].map(i => i.id));
    check(context.loot.every(i => !owned.has(i.id)), 'battle loot already owned');
    next = addItemsToInventory({ ...next, mode: before.battle.returnMode ?? 'manual', battle: undefined,
      inventory: { ...next.inventory, gold: next.inventory.gold + context.rewardGold } }, context.loot, 'Battle loot');
    await saveRoster(tx.pages, roster, next); await saveBattle(tx.pages, before, null);
    tx.setCheckpoint(checkpointJson({ ...checkpoint, mode: next.mode, updatedAt: now,
      wave: before.battle.returnMode === 'waves' ? before.battle.wave : checkpoint.wave,
      activityLog: [`Battle won. Rewards: ${context.rewardGold}g, ${context.loot.length} items.`, ...checkpoint.activityLog].slice(0, 12) }));
  } else {
    await saveRoster(tx.pages, roster, next);
    await saveBattle(tx.pages, before, nextBattle);
    tx.setCheckpoint(checkpointJson({ ...checkpoint, mode: status === 'lost' ? 'manual' : 'battle', updatedAt: now }));
  }
  await recordGameplay(tx, battleFact(status === 'active' ? 'turn' : status, trigger, before, status === 'won' ? null : nextBattle,
    { partyBefore: roster.state.party, partyAfter: next.party, newlyDefeatedCount: turn.newlyDefeated.length,
      walletGoldDelta: next.inventory.gold - roster.state.inventory.gold, lootAwardCount: status === 'won' ? context.loot.length : 0 }), now);
  return true;
}
