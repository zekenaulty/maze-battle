import { describe, expect, it } from 'vitest';
import { createNewGameState, normalizeGameState } from '../gameFactory';
import { createInitialParty } from './factory';

describe('shared initial party factory', () => {
  it('keeps the original ordered hero data, identities and skill charges', () => {
    const party = createInitialParty('test');
    expect(party).toEqual([
      {
        id: 'test-warrior', role: 'warrior', displayName: 'Vor', level: 1, xp: 0,
        hp: 110, maxHp: 110, mp: 0, maxMp: 0, gold: 0, autoBattle: true, autoSpendPoints: true,
        equipment: {}, attributes: { strength: 40, vitality: 30, intellect: 0, available: 0 },
        combat: { baseDamage: 8, scaleWith: 'strength' },
        skills: [{ id: 'slash', cooldown: 0 }, { id: 'cleave', cooldown: 0, charges: 2, maxCharges: 2 }, { id: 'slam', cooldown: 0, charges: 1, maxCharges: 1 }],
      },
      {
        id: 'test-mage', role: 'mage', displayName: 'Zyth', level: 1, xp: 0,
        hp: 50, maxHp: 50, mp: 130, maxMp: 130, gold: 0, autoBattle: true, autoSpendPoints: true,
        equipment: {}, attributes: { strength: 10, vitality: 15, intellect: 40, available: 0 },
        combat: { baseDamage: 7, scaleWith: 'intellect' },
        skills: ['wand', 'arcaneBlast', 'magicMissiles', 'arcaneWave', 'teleport'].map(id => ({ id, cooldown: 0 })),
      },
      {
        id: 'test-healer', role: 'healer', displayName: 'Ayla', level: 1, xp: 0,
        hp: 60, maxHp: 60, mp: 110, maxMp: 110, gold: 0, autoBattle: true, autoSpendPoints: true,
        equipment: {}, attributes: { strength: 10, vitality: 15, intellect: 40, available: 0 },
        combat: { baseDamage: 7, scaleWith: 'intellect' },
        skills: ['smite', 'heal', 'groupHeal', 'resurrect'].map(id => ({ id, cooldown: 0 })),
      },
    ]);
  });

  it('allocates independent mutable hero records on every call', () => {
    const first = createInitialParty('test');
    const second = createInitialParty('test');
    expect(first).toEqual(second);
    first.forEach((actor, index) => {
      expect(actor).not.toBe(second[index]);
      for (const key of ['equipment', 'attributes', 'combat', 'skills'] as const) expect(actor[key]).not.toBe(second[index][key]);
      actor.skills.forEach((skill, skillIndex) => expect(skill).not.toBe(second[index].skills[skillIndex]));
    });
    first[0].equipment.weapon = 'changed';
    first[0].attributes.strength = 0;
    first[0].combat.baseDamage = 0;
    first[0].skills[1].charges = 0;
    expect(createInitialParty('test')).toEqual(second);
  });

  it('uses the shared defaults for new and normalized games while preserving overrides', () => {
    const game = createNewGameState({ id: 'test' });
    expect(game.party).toEqual(createInitialParty('test'));
    expect(normalizeGameState(game).party).toEqual(game.party);
    const mage = { ...game.party[1], id: 'custom', hp: 3, autoSpendPoints: false };
    const normalized = normalizeGameState({ ...game, party: [mage] });
    expect(normalized.party[1]).toMatchObject(mage);
    expect(normalized.party[2]).toEqual(game.party[2]);
    expect(createNewGameState({ id: 'test', party: [mage] }).party).toEqual([mage]);
  });
});
