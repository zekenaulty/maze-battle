import { describe, expect, it } from 'vitest';
import { createNewGameState } from '../gameFactory';
import type { BattleState, EnemyState, GameState } from '../types';
import { equipItem } from '../items/inventory';
import { createItemInstance } from '../items/loot';
import { advanceBattleRound, setBattleReturnMode, startBattle, useBattleSkill } from './battleEngine';

const highRoll = () => 0.99;
const lowRoll = () => 0.1;

describe('battleEngine', () => {
  it('starts a battle with spawned enemies', () => {
    const game = startBattle(createNewGameState(), lowRoll);

    expect(game.mode).toBe('battle');
    expect(game.battle?.status).toBe('active');
    expect(game.battle?.enemies.length).toBeGreaterThan(0);
  });

  it('remembers auto-play as the return mode for grinder battles', () => {
    const game = startBattle(createNewGameState({ mode: 'auto-play' }), lowRoll);

    expect(game.mode).toBe('battle');
    expect(game.battle?.returnMode).toBe('auto-play');
  });

  it('counts repeated wave battles and returns to waves after victory', () => {
    const game = startBattle(createNewGameState({ mode: 'waves', wave: 2 }), lowRoll);

    expect(game.battle?.wave).toBe(3);
    expect(game.battle?.returnMode).toBe('waves');

    const won = advanceBattleRound(
      {
        ...game,
        battle: {
          ...game.battle!,
          enemies: [oneHpEnemy()],
        },
      },
      highRoll,
    );

    expect(won.mode).toBe('waves');
    expect(won.wave).toBe(3);
  });

  it('can retarget an active battle back to manual control', () => {
    const game = startBattle(createNewGameState({ mode: 'auto-play' }), lowRoll);
    const next = setBattleReturnMode(game, 'manual');

    expect(next.mode).toBe('battle');
    expect(next.battle?.returnMode).toBe('manual');
  });

  it('advances hero and enemy AI for an active round', () => {
    const game = startBattle(createNewGameState(), lowRoll);
    const next = advanceBattleRound(game, lowRoll);

    expect(next.battle?.round).toBe(2);
    expect(next.battle?.log.length).toBeGreaterThan(1);
  });

  it('awards rewards when the party wins', () => {
    const enemy = oneHpEnemy();
    const game = createNewGameState({
      mode: 'battle',
      battle: {
        id: 'battle-test',
        wave: 1,
        status: 'active',
        enemies: [enemy],
        round: 1,
        log: ['Battle begins.'],
      } satisfies BattleState,
    });

    const next = advanceBattleRound(game, highRoll);

    expect(next.mode).toBe('manual');
    expect(next.battle).toBeUndefined();
    expect(next.party[0].xp).toBeGreaterThan(0);
    expect(next.activityLog[0]).toBe('Battle won.');
  });

  it('returns to auto-play after an auto-play battle victory', () => {
    const game = createNewGameState({
      mode: 'battle',
      battle: {
        id: 'battle-test',
        wave: 1,
        status: 'active',
        returnMode: 'auto-play',
        enemies: [oneHpEnemy()],
        round: 1,
        log: ['Battle begins.'],
      } satisfies BattleState,
    });

    const next = advanceBattleRound(game, highRoll);

    expect(next.mode).toBe('auto-play');
    expect(next.battle).toBeUndefined();
  });

  it('auto-spends level points using role stat priorities', () => {
    const enemy = { ...oneHpEnemy(), level: 50 };
    const game = createNewGameState({
      mode: 'battle',
      battle: {
        id: 'battle-test',
        wave: 1,
        status: 'active',
        enemies: [enemy],
        round: 1,
        log: ['Battle begins.'],
      } satisfies BattleState,
    });

    const next = advanceBattleRound(game, highRoll);
    const warrior = next.party[0];

    expect(warrior.level).toBeGreaterThan(1);
    expect(warrior.attributes.available).toBe(0);
    expect(warrior.attributes.strength).toBeGreaterThan(game.party[0].attributes.strength);
    expect(warrior.attributes.vitality).toBeGreaterThan(game.party[0].attributes.vitality);
  });

  it('allows manual skill use through the same combat engine', () => {
    const game = createNewGameState({
      mode: 'battle',
      battle: {
        id: 'battle-test',
        wave: 1,
        status: 'active',
        enemies: [oneHpEnemy()],
        round: 1,
        log: ['Battle begins.'],
      } satisfies BattleState,
    });

    const next = useBattleSkill(game, game.party[0].id, 'slash', highRoll);

    expect(next.mode).toBe('manual');
    expect(next.battle).toBeUndefined();
    expect(next.activityLog[0]).toBe('Battle won.');
  });

  it('uses equipped item stats for combat without mutating base stats', () => {
    const sword = createItemInstance('iron-sword', 1, 'common', () => 0.5);
    const base = createNewGameState({
      inventory: {
        capacity: 10,
        gold: 0,
        items: [sword],
      },
    });
    const equipped = equipItem(base, base.party[0].id, sword.id);
    const game: GameState = {
      ...equipped,
      mode: 'battle',
      battle: {
        id: 'battle-test',
        wave: 1,
        status: 'active',
        enemies: [{ ...oneHpEnemy(), hp: 27, maxHp: 27 }],
        round: 1,
        log: ['Battle begins.'],
      } satisfies BattleState,
    };

    const next = useBattleSkill(game, game.party[0].id, 'slash', highRoll);

    expect(next.battle).toBeUndefined();
    expect(next.party[0].maxHp).toBe(game.party[0].maxHp);
    expect(next.party[0].combat.baseDamage).toBe(game.party[0].combat.baseDamage);
  });

  it('blocks manual skill spam during global cooldown', () => {
    const game = createNewGameState({
      mode: 'battle',
      battle: {
        id: 'battle-test',
        wave: 1,
        status: 'active',
        enemies: [sturdyEnemy()],
        round: 1,
        log: ['Battle begins.'],
      } satisfies BattleState,
    });

    const first = useBattleSkill(game, game.party[0].id, 'slash', highRoll, 1000);
    const duringGcd = useBattleSkill(first, first.party[0].id, 'cleave', highRoll, 1100);
    const afterGcd = useBattleSkill(first, first.party[0].id, 'cleave', highRoll, 1300);

    expect(first.party[0].gcdUntil).toBe(1250);
    expect(duringGcd).toBe(first);
    expect(afterGcd).not.toBe(first);
  });

  it('runs repeated timed rounds through victory without leaving an empty battle', () => {
    let game = createNewGameState({
      mode: 'battle',
      battle: {
        id: 'battle-test',
        wave: 1,
        status: 'active',
        enemies: [mediumEnemy('enemy-a'), mediumEnemy('enemy-b')],
        round: 1,
        log: ['Battle begins.'],
      } satisfies BattleState,
    });

    for (let round = 0; game.battle && round < 12; round++) {
      game = advanceBattleRound(game, highRoll, 1000 + round * 7000);
    }

    expect(game.mode).toBe('manual');
    expect(game.battle).toBeUndefined();
    expect(game.activityLog[0]).toBe('Battle won.');
    expect(game.party.some((actor) => actor.xp > 0)).toBe(true);
  });

  it('keeps a defeated party in a non-active lost battle state', () => {
    const game = createNewGameState({
      mode: 'battle',
      party: createNewGameState().party.map((actor) => ({ ...actor, hp: 1 })),
      battle: {
        id: 'battle-test',
        wave: 1,
        status: 'active',
        enemies: [killerEnemy('enemy-a'), killerEnemy('enemy-b'), killerEnemy('enemy-c')],
        round: 1,
        log: ['Battle begins.'],
      } satisfies BattleState,
    });

    const next = advanceBattleRound(game, highRoll, 1000);

    expect(next.mode).toBe('manual');
    expect(next.battle?.status).toBe('lost');
    expect(next.battle?.log.at(-1)).toBe('Party defeated.');
    expect(next.party.every((actor) => actor.hp === 0)).toBe(true);
  });

  it('recharges spent charges from the first pending recharge time', () => {
    const game = createNewGameState({
      mode: 'battle',
      battle: {
        id: 'battle-test',
        wave: 1,
        status: 'active',
        enemies: [sturdyEnemy()],
        round: 1,
        log: ['Battle begins.'],
      } satisfies BattleState,
    });

    const first = useBattleSkill(game, game.party[0].id, 'cleave', lowRoll, 1000);
    const second = useBattleSkill(first, first.party[0].id, 'cleave', lowRoll, 1600);
    const deniedBeforeRecharge = useBattleSkill(second, second.party[0].id, 'cleave', lowRoll, 3000);
    const allowedAfterRecharge = useBattleSkill(second, second.party[0].id, 'cleave', lowRoll, 3600);
    const cleaveAfterSecond = second.party[0].skills.find((skill) => skill.id === 'cleave');

    expect(cleaveAfterSecond?.charges).toBe(0);
    expect(cleaveAfterSecond?.rechargeUntil).toBe(3500);
    expect(deniedBeforeRecharge).toBe(second);
    expect(allowedAfterRecharge).not.toBe(second);
  });
});

function oneHpEnemy(): EnemyState {
  return {
    id: 'enemy-test',
    displayName: 'Test Slime',
    token: '(oo)',
    tags: ['beast'],
    level: 1,
    hp: 1,
    maxHp: 1,
    mp: 0,
    maxMp: 0,
    attributes: {
      strength: 1,
      vitality: 1,
      intellect: 0,
      available: 0,
    },
    combat: {
      baseDamage: 1,
      scaleWith: 'strength',
    },
    skills: [{ id: 'attack', cooldown: 0 }],
  };
}

function sturdyEnemy(): EnemyState {
  return {
    ...oneHpEnemy(),
    hp: 999,
    maxHp: 999,
  };
}

function mediumEnemy(id: string): EnemyState {
  return {
    ...oneHpEnemy(),
    id,
    hp: 80,
    maxHp: 80,
  };
}

function killerEnemy(id: string): EnemyState {
  return {
    ...oneHpEnemy(),
    id,
    hp: 999,
    maxHp: 999,
    combat: {
      baseDamage: 300,
      scaleWith: 'strength',
    },
  };
}
