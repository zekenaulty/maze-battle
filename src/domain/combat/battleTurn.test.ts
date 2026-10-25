import { describe, expect, it, vi } from 'vitest';
import { createInitialParty } from '../party/factory';
import type { EnemyState, SkillId } from '../types';
import type { BattleFrame } from './battleContext';
import { executeBattleTurn } from './battleTurn';
import { SKILLS } from './skillCatalog';

const now = 1000, highRoll = () => 0.99;
const skillIds = ['attack', 'slash', 'cleave', 'slam', 'smite', 'heal', 'groupHeal', 'resurrect',
  'wand', 'arcaneBlast', 'magicMissiles', 'arcaneWave', 'teleport'] as const satisfies readonly SkillId[];

function enemy(id = 'enemy', hp = 10000): EnemyState {
  return { id, displayName: id, token: 'E', tags: ['beast'], level: 1, hp, maxHp: hp, mp: 0, maxMp: 0,
    attributes: { strength: 1, vitality: 1, intellect: 0, available: 0 }, combat: { baseDamage: 1, scaleWith: 'strength' },
    skills: [{ id: 'attack', cooldown: 0, cooldownUntil: 100000 }] };
}
function frame(): BattleFrame {
  return { party: createInitialParty('turn').map(actor => ({ ...actor, autoBattle: false })),
    battle: { status: 'active', enemies: [enemy()], defeated: [], log: [], loot: [], rewardGold: 0 }, equipmentBonuses: {} };
}

describe('narrow battle turns', () => {
  it('keeps the complete skill catalog exposed without a camp-only allowlist', () => {
    expect(Object.keys(SKILLS).sort()).toEqual([...skillIds].sort());
  });

  it.each(skillIds)('executes %s through the existing effect and timer rules', skillId => {
    const f = frame();
    const caster = f.party.find(actor => actor.skills.some(skill => skill.id === skillId)) ?? f.party[0];
    if (skillId === 'attack') caster.skills = [{ id: skillId, cooldown: 0 }];
    if (skillId === 'resurrect') f.party[0].hp = 0;
    else f.party.forEach(actor => { actor.hp = Math.ceil(actor.maxHp / 2); });
    if (skillId === 'wand') caster.mp = 10;
    const before = structuredClone(f), definition = SKILLS[skillId];
    const turn = executeBattleTurn(f, { kind: 'skill', actorId: caster.id, skillId }, highRoll, now);
    const after = turn.context.party.find(actor => actor.id === caster.id)!;
    expect(turn.acted).toBe(true); expect(turn.status).toBe('active');
    expect(after.mp).toBe(caster.mp - definition.mpCost + (skillId === 'wand' ? 10 : 0));
    expect(after.gcdUntil).toBe(now + 250);
    expect(after.skills.find(skill => skill.id === skillId)?.cooldownUntil).toBe(now + definition.cooldownMs);
    const beforeSkill = caster.skills.find(skill => skill.id === skillId)!;
    if (beforeSkill.charges !== undefined) {
      const afterSkill = after.skills.find(skill => skill.id === skillId)!;
      expect(afterSkill.charges).toBe(beforeSkill.charges - 1);
      expect(afterSkill.rechargeUntil).toBe(now + definition.rechargeMs!);
    }
    if (definition.target === 'enemy' || definition.target === 'allEnemies') expect(turn.context.enemies[0].hp).toBeLessThan(f.battle.enemies[0].hp);
    if (skillId === 'heal' || skillId === 'groupHeal' || skillId === 'resurrect')
      expect(turn.context.party.some((actor, index) => actor.hp > f.party[index].hp)).toBe(true);
    if (skillId === 'teleport') expect(turn.context.enemies).toEqual(f.battle.enemies);
    expect(turn.newlyDefeated).toEqual([]); expect(f).toEqual(before);
  });

  it('responds to a manual skill with enemy AI even when all hero Auto switches are off', () => {
    const f = frame(); f.battle.enemies[0].skills[0].cooldownUntil = undefined;
    const turn = executeBattleTurn(f, { kind: 'skill', actorId: f.party[0].id, skillId: 'slash' }, highRoll, now);
    expect(turn.context.log[0]).toContain('Slash'); expect(turn.context.log[1]).toContain('Attack');
    expect(turn.context.party.some((actor, index) => actor.hp < f.party[index].hp)).toBe(true);
  });

  it('runs enabled hero AI in party order before enemy AI, without enabling disabled heroes', () => {
    const f = frame(); f.party[0].autoBattle = true; f.party[1].autoBattle = true;
    f.battle.enemies[0].skills[0].cooldownUntil = undefined;
    const turn = executeBattleTurn(f, { kind: 'round' }, highRoll, now);
    expect(turn.context.log[0]).toContain(f.party[0].displayName);
    expect(turn.context.log[1]).toContain(f.party[1].displayName);
    expect(turn.context.log.at(-1)).toContain('enemy uses Attack');
    expect(turn.context.party[2].gcdUntil).toBeUndefined();
    expect(turn.context.party.map(actor => actor.autoBattle)).toEqual([true, true, false]);
  });

  it.each([1249, 1250, 1999, 2000])('checks GCD and skill deadlines at host time %i', time => {
    const f = frame(), caster = f.party[0]; caster.gcdUntil = 1250;
    caster.skills.find(skill => skill.id === 'slash')!.cooldownUntil = 2000;
    const turn = executeBattleTurn(f, { kind: 'skill', actorId: caster.id, skillId: 'slash' }, highRoll, time);
    expect(turn.acted).toBe(time === 2000);
    if (time === 2000) expect(turn.context.party[0].gcdUntil).toBe(2250);
    else expect(turn.context.log).toEqual([]);
  });

  it.each([2499, 2500, 7500])('preserves charge catch-up and the next recharge deadline at %i', time => {
    const f = frame(), caster = f.party[0], skill = caster.skills.find(skill => skill.id === 'cleave')!;
    skill.charges = 0; skill.rechargeUntil = 2500;
    const turn = executeBattleTurn(f, { kind: 'skill', actorId: caster.id, skillId: 'cleave' }, highRoll, time);
    const after = turn.context.party[0].skills.find(skill => skill.id === 'cleave')!;
    expect(turn.acted).toBe(time >= 2500);
    expect(after.charges).toBe(time === 7500 ? 1 : 0);
    expect(after.rechargeUntil).toBe(time === 7500 ? 10000 : time === 2500 ? 5000 : 2500);
  });

  it.each(['actor', 'skill', 'mana', 'dead'] as const)('refuses invalid manual %s without enemy response or RNG', damage => {
    const f = frame(), caster = f.party[1], rng = vi.fn(highRoll);
    if (damage === 'mana') caster.mp = 0;
    if (damage === 'dead') caster.hp = 0;
    const before = structuredClone(f);
    const turn = executeBattleTurn(f, { kind: 'skill', actorId: damage === 'actor' ? 'missing' : caster.id,
      skillId: damage === 'skill' ? 'slash' : 'arcaneBlast' }, rng, now);
    expect(turn.acted).toBe(false); expect(turn.status).toBe('active');
    expect(turn.context.log).toEqual([]); expect(turn.newlyDefeated).toEqual([]);
    expect(rng).not.toHaveBeenCalled(); expect(f).toEqual(before);
  });

  it('owns actor, enemy, equipment and pending-loot copies without requiring a world or inventory', () => {
    const f = frame(); f.equipmentBonuses = { [f.party[0].id]: { strength: 3 } };
    f.battle.loot = [{ id: 'pending', baseId: 'coin', displayName: 'Coin', token: 'G', category: 'currency',
      rarity: 'common', itemLevel: 1, value: 1 }];
    const before = structuredClone(f), turn = executeBattleTurn(f, { kind: 'round' }, highRoll, now);
    expect(turn.acted).toBe(false);
    turn.context.party[0].skills[0].cooldownUntil = 9999;
    turn.context.enemies[0].hp = 0;
    turn.context.equipmentBonuses[f.party[0].id].strength = 999;
    turn.context.loot[0].displayName = 'Changed';
    expect(f).toEqual(before);
  });

  it('retains pending gold/loot and emits only new defeat credits across copied frames', () => {
    const f = frame(); f.battle.enemies.push(enemy('reward', 1));
    const first = executeBattleTurn(f, { kind: 'skill', actorId: f.party[0].id, skillId: 'slash' }, highRoll, now);
    expect(first.newlyDefeated.map(enemy => enemy.id)).toEqual(['reward']);
    expect(first.context.rewardGold).toBe(2); expect(first.context.loot).toHaveLength(2);
    expect(first.context.party[0].xp).toBeGreaterThan(0);
    const resumed: BattleFrame = { party: structuredClone(first.context.party), equipmentBonuses: {},
      battle: { status: 'active', enemies: [...structuredClone(first.context.enemies), { ...first.context.defeated[0], hp: 0 }],
        defeated: structuredClone(first.context.defeated), loot: structuredClone(first.context.loot),
        log: [...first.context.log], rewardGold: first.context.rewardGold } };
    const rng = vi.fn(highRoll), second = executeBattleTurn(resumed, { kind: 'round' }, rng, 2000);
    expect(second.newlyDefeated).toEqual([]);
    expect(second.context.rewardGold).toBe(2); expect(second.context.loot).toEqual(first.context.loot);
    expect(second.context.party.map(actor => actor.xp)).toEqual(first.context.party.map(actor => actor.xp));
    expect(rng).toHaveBeenCalledTimes(1);
  });

  it('does not retaliate after the last enemy is defeated', () => {
    const f = frame(); f.battle.enemies = [enemy('last', 1)];
    const turn = executeBattleTurn(f, { kind: 'skill', actorId: f.party[0].id, skillId: 'slash' }, highRoll, now);
    expect(turn.status).toBe('won'); expect(turn.context.enemies).toEqual([]);
    expect(turn.context.log.some(entry => entry.includes('uses Attack'))).toBe(false);
  });

  it('reports a terminal loss even when an idle round had no legal action', () => {
    const f = frame(); f.party.forEach(actor => { actor.hp = 0; });
    const turn = executeBattleTurn(f, { kind: 'round' }, highRoll, now);
    expect(turn.acted).toBe(false); expect(turn.status).toBe('lost'); expect(turn.newlyDefeated).toEqual([]);
  });

  it.each(['won', 'lost'] as const)('does not start a replacement battle for a %s frame', status => {
    const f = frame(); f.battle.status = status; const rng = vi.fn(highRoll);
    expect(() => executeBattleTurn(f, { kind: 'round' }, rng, now)).toThrow('active battle');
    expect(rng).not.toHaveBeenCalled();
  });
});
