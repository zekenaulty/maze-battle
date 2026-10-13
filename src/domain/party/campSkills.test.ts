import { describe, expect, it } from 'vitest';
import { itemFixture } from '../../viewModels/characterTestFixtures';
import { SKILLS } from '../combat/skillCatalog';
import { rosterFixture } from './rosterTestFixtures';
import { castCampSkill, type CampSkill } from './campSkills';

const now = 10000, rng = () => { throw new Error('Camp healing must not roll combat or world RNG'); };

describe('shared camp skill rules', () => {
  it('selects the lowest equipment-adjusted living health ratio and uses real heal costs and timers', () => {
    const state = rosterFixture(), [warrior, mage, healer] = state.party;
    const armor = itemFixture({ id: 'armor', slot: 'body', stats: { maxHp: 20, vitality: 5 } });
    warrior.equipment.body = armor.id;
    state.inventory.items.push(armor);
    warrior.hp = 60; mage.hp = 25;
    const before = structuredClone(state), next = castCampSkill(state, healer.id, 'heal', rng, now);
    expect(next.party[0].hp).toBe(109); // ceil((110 + 20 + 5*2) * .35) = 49.
    expect(next.party[1].hp).toBe(25);
    expect(next.party[2].mp).toBe(healer.mp - 4);
    expect(next.party[2].gcdUntil).toBe(now + 250);
    expect(next.party[2].skills.find(s => s.id === 'heal')?.cooldownUntil).toBe(now + 1500);
    expect(next.inventory).toBe(state.inventory);
    expect(next.stash).toBe(state.stash);
    expect(next.activityLog[0]).toBe('Ayla casts Heal on Vor.');
    expect(castCampSkill(next, healer.id, 'heal', rng, now + 1500).party[1].hp).toBe(43);
    expect(state).toEqual(before);
  });

  it('heals missing equipment HP above the base cap without overhealing', () => {
    const state = rosterFixture(), [warrior, , healer] = state.party;
    const armor = itemFixture({ id: 'armor', slot: 'body', stats: { maxHp: 20, vitality: 5 } });
    state.inventory.items.push(armor); warrior.equipment.body = armor.id;
    expect(castCampSkill(state, healer.id, 'heal', rng, now).party[0].hp).toBe(140);
  });

  it('group-heals living allies with caps and leaves fallen members dead', () => {
    const state = rosterFixture(), [warrior, mage, healer] = state.party;
    warrior.hp = 109; mage.hp = 0; healer.hp = 1;
    const next = castCampSkill(state, healer.id, 'groupHeal', rng, now);
    expect(next.party.map(a => a.hp)).toEqual([110, 0, 16]);
    expect(next.party[2].mp).toBe(healer.mp - 8);
    expect(next.party[2].skills.find(s => s.id === 'groupHeal')?.cooldownUntil).toBe(now + 6000);
    expect(next.activityLog[0]).toBe('Ayla casts Group Heal.');
  });

  it('resurrects only the first fallen ally at half its effective max HP and charges the caster', () => {
    const state = rosterFixture(), [warrior, mage, healer] = state.party;
    const armor = itemFixture({ id: 'armor', slot: 'body', stats: { maxHp: 20, vitality: 5 } });
    state.inventory.items.push(armor); warrior.equipment.body = armor.id;
    warrior.hp = 0; mage.hp = 0;
    const next = castCampSkill(state, healer.id, 'resurrect', rng, now);
    expect(next.party.map(a => a.hp)).toEqual([70, 0, 60]);
    expect(next.party[2].mp).toBe(healer.mp - 20);
    expect(next.party[2].skills.find(s => s.id === 'resurrect')?.cooldownUntil).toBe(now + 2000);
    expect(next.activityLog[0]).toBe('Ayla resurrects Vor.');
  });

  it.each(['heal', 'groupHeal', 'resurrect'] as const)('does not consume %s on absent targets, actors, mana or during battle', skillId => {
    const state = rosterFixture(), healer = state.party[2];
    expect(castCampSkill(state, healer.id, skillId, rng, now)).toBe(state);
    state.party[0].hp = skillId === 'resurrect' ? 0 : 1;
    expect(castCampSkill(state, 'absent', skillId, rng, now)).toBe(state);
    expect(castCampSkill(state, state.party[1].id, skillId, rng, now)).toBe(state);
    const battle = { ...state, battle: { id: 'battle', status: 'active' as const, round: 1, wave: 1, enemies: [], log: [] } };
    expect(castCampSkill(battle, healer.id, skillId, rng, now)).toBe(battle);
    const battleMode = { ...state, mode: 'battle' as const };
    expect(castCampSkill(battleMode, healer.id, skillId, rng, now)).toBe(battleMode);
    healer.mp = SKILLS[skillId].mpCost - 1;
    expect(castCampSkill(state, healer.id, skillId, rng, now)).toBe(state);
    healer.mp = 100; healer.hp = 0;
    expect(castCampSkill(state, healer.id, skillId, rng, now)).toBe(state);
  });

  it('enforces GCD, skill cooldown and charges without consuming anything on a rejected action', () => {
    const state = rosterFixture(), healer = state.party[2];
    state.party[0].hp = 1;
    healer.gcdUntil = now + 1;
    expect(castCampSkill(state, healer.id, 'heal', rng, now)).toBe(state);
    healer.gcdUntil = undefined;
    const skill = healer.skills.find(s => s.id === 'heal')!;
    skill.cooldownUntil = now + 1;
    expect(castCampSkill(state, healer.id, 'heal', rng, now)).toBe(state);
    skill.cooldownUntil = undefined; skill.charges = 0; skill.maxCharges = 1;
    expect(castCampSkill(state, healer.id, 'heal', rng, now)).toBe(state);
    skill.charges = 1;
    const next = castCampSkill(state, healer.id, 'heal', rng, now);
    expect(next.party[2].skills.find(s => s.id === 'heal')?.charges).toBe(0);
    expect(skill.charges).toBe(1);
    expect(castCampSkill(next, healer.id, 'groupHeal', rng, now + 100)).toBe(next);
    expect(castCampSkill(next, healer.id, 'heal', rng, now + 300)).toBe(next);
  });

  it('keeps the canonical log bound, timestamp and extra fields without adding a fake world', () => {
    const state = { ...rosterFixture({ mode: 'town', activityLog: Array.from({ length: 12 }, (_, i) => `Entry ${i}`) }), marker: 'preserved' };
    state.party[0].hp = 1;
    const next = castCampSkill(state, state.party[2].id, 'heal', rng, now);
    expect(next.activityLog).toHaveLength(12);
    expect(next.updatedAt).toBe(new Date(now).toISOString());
    expect(next.marker).toBe('preserved');
    expect(Object.keys(next).sort()).toEqual(Object.keys(state).sort());
    expect(next.mode).toBe('town');
    expect(castCampSkill(state, state.party[1].id, 'teleport' as CampSkill, rng, now)).toBe(state);
  });
});
