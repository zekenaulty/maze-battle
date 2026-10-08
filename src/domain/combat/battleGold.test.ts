import { describe, expect, it, vi } from 'vitest';
import type { EnemyState, GameState } from '../types';
import { createNewGameState, normalizeGameState } from '../gameFactory';
import { buyVendorItem } from '../items/inventory';
import { lineMaze } from '../automation/autopilotTestFixtures';
import { battleRewardGold, createCombatContext, removeDefeated } from './battleContext';
import { advanceBattleRound, endBattle, startBattle, useBattleSkill } from './battleEngine';

const highRoll = () => 0.99;
const lowRoll = () => 0.1;

describe('battle gold settlement', () => {
  it.each([1, 2, 3])('credits one monster roll, not legacy balances or %i party copies', (partySize) => {
    const base = battleWith([enemy('one')]);
    const game = { ...base, party: base.party.slice(0, partySize) };
    const won = useBattleSkill(game, game.party[0].id, 'slash', highRoll, 1000);
    expect(won.battle).toBeUndefined();
    expect(won.inventory.gold).toBe(game.inventory.gold + 2);
    expect(won.party.map((actor, index) => actor.gold - game.party[index].gold)).toEqual(Array(partySize).fill(2));
    expect(won.activityLog).toContain('Battle gold: 2g.');
    expect(useBattleSkill(won, won.party[0].id, 'slash', highRoll, 9000)).toBe(won);
    expect(normalizeGameState(won).inventory.gold).toBe(won.inventory.gold);
  });

  it('does not depend on the first actor being alive and preserves legacy reward eligibility', () => {
    const base = battleWith([enemy('one')]);
    const game = { ...base, party: base.party.map((actor, index) => index === 0 ? { ...actor, hp: 0 } : actor) };
    const won = useBattleSkill(game, game.party[1].id, 'wand', highRoll, 1000);
    expect(won.inventory.gold).toBe(2);
    expect(won.party.map((actor, index) => actor.gold - game.party[index].gold)).toEqual([0, 2, 2]);
  });

  it('accumulates across turns and reloads, then pays once per wave into the spendable wallet', () => {
    let game = battleWith([enemy('a'), enemy('b'), enemy('c')], 'waves');
    const legacyGold = game.party.map((actor) => actor.gold);
    for (let turn = 0; turn < 3; turn++) {
      game = useBattleSkill(game, game.party[0].id, 'slash', highRoll, 1000 + turn * 4000);
      if (turn < 2) {
        expect(game.inventory.gold).toBe(0);
        expect(battleRewardGold(game.battle)).toBe((turn + 1) * 2);
        expect(useBattleSkill(game, game.party[0].id, 'slash', highRoll, 1001 + turn * 4000)).toBe(game);
        game = normalizeGameState(JSON.parse(JSON.stringify(game)));
        expect(battleRewardGold(game.battle)).toBe((turn + 1) * 2);
      }
    }
    expect(game.mode).toBe('waves');
    expect(game.wave).toBe(1);
    expect(game.inventory.gold).toBe(6);
    expect(game.party.map((actor, index) => actor.gold - legacyGold[index])).toEqual([6, 6, 6]);
    const bought = buyVendorItem({ ...game, mode: 'town' }, 'health-herb');
    expect(bought.inventory.gold).toBe(0);
    expect(bought.party.map((actor) => actor.gold)).toEqual(game.party.map((actor) => actor.gold));

    const started = advanceBattleRound(game, lowRoll, 20000);
    expect(started.battle?.wave).toBe(2);
    expect(battleRewardGold(started.battle)).toBe(0);
    expect(started.inventory.gold).toBe(6);
    const nextWave = useBattleSkill({ ...started, battle: { ...started.battle!, enemies: [enemy('next-wave')] } }, started.party[0].id, 'slash', highRoll, 30000);
    expect(nextWave.wave).toBe(2);
    expect(nextWave.inventory.gold).toBe(8);
    expect(endBattle(nextWave).inventory.gold).toBe(8);
  });

  it('deduplicates saved defeated enemies rather than paying their gold twice', () => {
    const game = battleWith([enemy('a'), enemy('b')]);
    const partial = useBattleSkill(game, game.party[0].id, 'slash', highRoll, 1000);
    const reloaded = normalizeGameState(JSON.parse(JSON.stringify(partial)));
    const duplicate = { ...reloaded, battle: { ...reloaded.battle!, enemies: [...reloaded.battle!.enemies, reloaded.battle!.defeated![0]] } };
    const won = useBattleSkill(duplicate, duplicate.party[0].id, 'slash', highRoll, 5000);
    expect(won.inventory.gold).toBe(4);
    expect(won.party.map((actor, index) => actor.gold - game.party[index].gold)).toEqual([4, 4, 4]);
  });

  it('retains historical actor gold but does not infer old pending rewards from it', () => {
    const base = battleWith([enemy('one')]);
    const legacy = {
      ...base,
      battle: { id: 'legacy-battle', wave: 1, status: 'active' as const, round: 1, log: [], enemies: [enemy('one')] },
    };
    expect(battleRewardGold(legacy.battle)).toBe(0);
    const won = useBattleSkill(normalizeGameState(legacy), legacy.party[0].id, 'slash', highRoll, 1000);
    expect(won.inventory.gold).toBe(2);
    expect(won.party.map((actor, index) => actor.gold - base.party[index].gold)).toEqual([2, 2, 2]);
  });

  it('does not reroll gold while collecting, persisting, or checking an already defeated enemy', () => {
    const game = battleWith([{ ...enemy('one'), hp: 0 }]);
    const rng = vi.fn().mockReturnValueOnce(0.99).mockReturnValue(0);
    const context = createCombatContext(game, rng, 1000);
    expect(removeDefeated(context, rng)).toBe(true);
    expect(context.rewardGold).toBe(2);
    expect(rng).toHaveBeenCalledTimes(2); // One monster-gold roll and one zero-loot roll.
    expect(removeDefeated(context, rng)).toBe(false);
    expect(rng).toHaveBeenCalledTimes(2);
  });

  it('keeps zero gold rolls at zero', () => {
    const game = battleWith([enemy('one')]);
    const won = useBattleSkill(game, game.party[0].id, 'slash', lowRoll, 1000);
    expect(won.inventory.gold).toBe(0);
    expect(won.party.map((actor) => actor.gold)).toEqual(game.party.map((actor) => actor.gold));
  });

  it('does not settle an abandoned or lost battle, or carry its pending gold into another battle', () => {
    const game = battleWith([enemy('a'), enemy('b')]);
    const partial = useBattleSkill(game, game.party[0].id, 'slash', highRoll, 1000);
    expect(battleRewardGold(partial.battle)).toBe(2);
    const abandoned = endBattle(partial);
    expect(abandoned.inventory.gold).toBe(0);
    expect(abandoned.party.map((actor) => actor.gold)).toEqual(partial.party.map((actor) => actor.gold));
    expect(battleRewardGold(startBattle(abandoned, lowRoll).battle)).toBe(0);

    const killer = (id: string) => ({ ...enemy(id), hp: 999, maxHp: 999, combat: { baseDamage: 300, scaleWith: 'strength' as const }, skills: [{ id: 'attack' as const, cooldown: 0 }] });
    const started = battleWith([killer('a'), killer('b'), killer('c'), enemy('reward')]);
    const vulnerable = { ...started, party: started.party.map((actor) => ({ ...actor, hp: 1 })) };
    const lost = useBattleSkill(vulnerable, vulnerable.party[0].id, 'slash', highRoll, 1000);
    expect(lost.battle?.status).toBe('lost');
    expect(battleRewardGold(lost.battle)).toBe(2);
    expect(lost.inventory.gold).toBe(0);
    expect(advanceBattleRound(lost, highRoll)).toBe(lost);
    expect(endBattle(lost).inventory.gold).toBe(0);
  });
});

function battleWith(enemies: EnemyState[], mode: 'manual' | 'waves' = 'manual'): GameState {
  const base = createNewGameState({ maze: lineMaze(3), mode, inventory: { capacity: 36, gold: 0, items: [] } });
  const started = startBattle({ ...base, party: base.party.map((actor, index) => ({ ...actor, autoBattle: false, gold: (index + 1) * 100 })) }, lowRoll);
  return { ...started, battle: { ...started.battle!, enemies } };
}

function enemy(id: string): EnemyState {
  return {
    id, displayName: 'Reward target', token: '!', tags: ['beast'], level: 1, hp: 1, maxHp: 1, mp: 0, maxMp: 0,
    attributes: { strength: 1, vitality: 1, intellect: 0, available: 0 }, combat: { baseDamage: 1, scaleWith: 'strength' }, skills: [],
  };
}
