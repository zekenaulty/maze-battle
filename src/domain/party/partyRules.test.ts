import { describe, expect, it } from 'vitest';
import { grantRewards } from '../combat/rewards';
import { rosterFixture } from './rosterTestFixtures';
import { setActorAutoBattle, setAutoSpendPoints, spendAttribute } from './partyRules';

describe('bounded party rules', () => {
  it.each(['strength', 'vitality', 'intellect'] as const)('spends one %s point without restoring resources or changing ownership', attribute => {
    const state = rosterFixture(), actor = state.party[0];
    actor.attributes.available = 1;
    actor.hp = 10;
    const before = structuredClone(state), next = spendAttribute(state, actor.id, attribute);
    expect(next.party[0].attributes).toEqual({ ...actor.attributes, available: 0, [attribute]: actor.attributes[attribute] + 1 });
    expect(next.party[0].maxHp).toBe(actor.maxHp + (attribute === 'vitality' ? 2 : 0));
    expect(next.party[0].maxMp).toBe(actor.maxMp + (attribute === 'intellect' ? 2 : 0));
    expect(next.party[0].hp).toBe(10);
    expect(next.party[0].mp).toBe(actor.mp);
    expect(next.party[1]).toBe(state.party[1]);
    expect(next.inventory).toBe(state.inventory);
    expect(next.stash).toBe(state.stash);
    expect(spendAttribute(next, actor.id, attribute)).toBe(next);
    expect(spendAttribute(state, 'absent', attribute)).toBe(state);
    expect(state).toEqual(before);
  });

  it.each([
    { index: 0, strength: 3, vitality: 2, intellect: 0 },
    { index: 1, strength: 0, vitality: 1, intellect: 4 },
    { index: 2, strength: 0, vitality: 2, intellect: 3 },
  ])('preserves the actual class allocation plan for party member $index', ({ index, strength, vitality, intellect }) => {
    const state = rosterFixture(), actor = state.party[index];
    actor.attributes.available = 5;
    const manual = setAutoSpendPoints(state, actor.id, false);
    expect(grantRewards(manual.party, [], () => 0.5)[index].attributes.available).toBe(5);
    expect(setAutoSpendPoints(manual, actor.id, false)).toBe(manual);
    const auto = setAutoSpendPoints(manual, actor.id, true);
    expect(auto.party[index].attributes.available).toBe(5); // Policy applies at reward processing, not on toggle.
    const rewarded = grantRewards(auto.party, [], () => 0.5)[index];
    expect(rewarded.attributes).toEqual({ strength: actor.attributes.strength + strength,
      vitality: actor.attributes.vitality + vitality, intellect: actor.attributes.intellect + intellect, available: 0 });
    expect(rewarded.maxHp).toBe(actor.maxHp + vitality * 2);
    expect(rewarded.maxMp).toBe(actor.maxMp + intellect * 2);
    expect(setAutoSpendPoints(state, 'absent', false)).toBe(state);
    expect(state.party[index]).toBe(actor);
    expect(actor.attributes.available).toBe(5);
  });

  it('changes only the requested actor battle policy without starting combat or world automation', () => {
    const state = rosterFixture({ activityLog: Array.from({ length: 12 }, (_, i) => `Entry ${i}`) });
    const actor = state.party[1], before = structuredClone(state);
    const next = setActorAutoBattle(state, actor.id, false);
    expect(next.party[1].autoBattle).toBe(false);
    expect(next.party[0]).toBe(state.party[0]);
    expect(next.activityLog).toHaveLength(12);
    expect(next.activityLog[0]).toBe(`${actor.displayName} auto battle disabled.`);
    expect(next.mode).toBe(state.mode);
    expect(next.battle).toBeUndefined();
    expect(next.inventory).toBe(state.inventory);
    expect(setActorAutoBattle(next, actor.id, false)).toBe(next);
    expect(setActorAutoBattle(next, 'absent', true)).toBe(next);
    expect(setActorAutoBattle(next, actor.id, true).party[1].autoBattle).toBe(true);
    expect(state).toEqual(before);
  });
});
