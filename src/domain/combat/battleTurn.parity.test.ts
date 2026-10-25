import { describe, expect, it } from 'vitest';
import { createNewGameState } from '../gameFactory';
import { getEquipmentStats } from '../items/equipment';
import { createItemInstance } from '../items/loot';
import type { BattleState, EnemyState } from '../types';
import { advanceBattleRound, useBattleSkill } from './battleEngine';
import { executeBattleTurn, type BattleTurnCommand } from './battleTurn';

function enemy(hp: number): EnemyState {
  return { id: 'enemy', displayName: 'Enemy', token: 'E', tags: ['beast'], level: 1, hp, maxHp: hp, mp: 0, maxMp: 0,
    attributes: { strength: 1, vitality: 1, intellect: 0, available: 0 }, combat: { baseDamage: 1, scaleWith: 'strength' },
    skills: [{ id: 'attack', cooldown: 0, cooldownUntil: 100000 }] };
}

describe('legacy battle adapter parity', () => {
  it.each(['skill', 'round', 'idle', 'win', 'equipment'] as const)('publishes the same core state for %s', scenario => {
    const battle: BattleState = { id: 'battle', wave: 3, status: 'active', round: 2, returnMode: 'waves',
      enemies: [enemy(scenario === 'win' ? 1 : 10000)], defeated: [], log: [], loot: [], rewardGold: 0 };
    const game = createNewGameState({ mode: 'battle', battle });
    if (scenario === 'idle' || scenario === 'skill') game.party.forEach(actor => { actor.autoBattle = false; });
    if (scenario === 'equipment') {
      const sword = createItemInstance('iron-sword', 1, 'common', () => 0.5);
      game.inventory.items.push(sword); game.party[0].equipment.weapon = sword.id;
    }
    const frame = { party: game.party, battle: game.battle!,
      equipmentBonuses: Object.fromEntries(game.party.map(actor => [actor.id, getEquipmentStats(actor, game.inventory)])) };
    const command: BattleTurnCommand = scenario === 'round' || scenario === 'idle' ? { kind: 'round' }
      : { kind: 'skill', actorId: game.party[0].id, skillId: 'slash' };
    const before = structuredClone(game), turn = executeBattleTurn(frame, command, () => 0.1, 1000);
    const legacy = command.kind === 'round' ? advanceBattleRound(game, () => 0.1, 1000)
      : useBattleSkill(game, command.actorId, command.skillId, () => 0.1, 1000);
    expect(game).toEqual(before);
    if (!turn.acted && turn.status === 'active') { expect(legacy).toBe(game); return; }
    expect(legacy.party).toEqual(turn.context.party);
    if (turn.status === 'won') {
      expect(legacy.battle).toBeUndefined(); expect(legacy.mode).toBe('waves'); expect(legacy.wave).toBe(3);
      expect(legacy.inventory.gold).toBe(game.inventory.gold + turn.context.rewardGold);
    } else {
      expect(legacy.battle).toMatchObject({ status: turn.status, enemies: turn.context.enemies,
        defeated: turn.context.defeated, loot: turn.context.loot, rewardGold: turn.context.rewardGold,
        round: battle.round + 1, log: turn.context.log.slice(-20) });
    }
  });
});
