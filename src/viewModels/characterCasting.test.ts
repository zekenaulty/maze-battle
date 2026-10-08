import { describe, expect, it } from 'vitest';
import type { SkillId, SkillState } from '../domain/types';
import { explorationCastReason } from './characterSkills';
import { characterFixture, inventoryFixture, itemFixture } from './characterTestFixtures';

describe('exploration skill availability', () => {
  const caster = characterFixture({ mp: 50, maxMp: 60 });
  const fallen = characterFixture({ id: 'fallen', hp: 0 });
  const inventory = inventoryFixture();
  const context = { party: [caster, fallen], now: 1000, allowed: true, hasHandler: true };
  const skill = (id: SkillId): SkillState => ({ id, cooldown: 0 });

  it('permits exactly the four exploration skills without mutating state or choosing a target', () => {
    const snapshot = JSON.stringify({ caster, inventory, context });
    for (const id of ['heal', 'groupHeal', 'resurrect', 'teleport'] as const) {
      expect(explorationCastReason(caster, inventory, skill(id), context)).toBeUndefined();
    }
    expect(explorationCastReason(caster, inventory, skill('wand'), context)).toBe('Combat-only skill');
    expect(JSON.stringify({ caster, inventory, context })).toBe(snapshot);
  });

  it('requires both an explicit host allowance and callback', () => {
    expect(explorationCastReason(caster, inventory, skill('heal'), { ...context, allowed: undefined })).toBe('Outside combat only');
    expect(explorationCastReason(caster, inventory, skill('heal'), { ...context, allowed: false })).toBe('Outside combat only');
    expect(explorationCastReason(caster, inventory, skill('heal'), { ...context, hasHandler: false })).toBe('Casting unavailable');
  });

  it('checks the living caster, effective mana, GCD, cooldown and charges at the supplied time', () => {
    expect(explorationCastReason({ ...caster, hp: 0 }, inventory, skill('heal'), context)).toBe('Caster is fallen');
    expect(explorationCastReason({ ...caster, mp: 3 }, inventory, skill('heal'), context)).toBe('Needs 1 MP');
    expect(explorationCastReason({ ...caster, gcdUntil: 1250 }, inventory, skill('heal'), context)).toBe('Cooldown 0.3s');
    expect(explorationCastReason(caster, inventory, { ...skill('heal'), cooldownUntil: 2000 }, context)).toBe('Cooldown 1s');
    expect(explorationCastReason(caster, inventory, { ...skill('heal'), charges: 0, maxCharges: 1 }, context)).toBe('No charges');
    expect(explorationCastReason({ ...caster, gcdUntil: 2000 }, inventory, { ...skill('heal'), cooldownUntil: 2000 }, { ...context, now: 2000 })).toBeUndefined();
  });

  it('checks injured living allies against gear-effective HP, and resurrection against fallen allies', () => {
    const full = { ...caster, hp: caster.maxHp };
    const fullContext = { ...context, party: [full, fallen] };
    for (const id of ['heal', 'groupHeal'] as const) {
      expect(explorationCastReason(full, inventory, skill(id), fullContext)).toBe('No injured living allies');
      const gear = itemFixture({ stats: { maxHp: 10 } });
      const equipped = { ...full, equipment: { weapon: gear.id } };
      expect(explorationCastReason(equipped, inventoryFixture([gear]), skill(id), { ...context, party: [equipped] })).toBeUndefined();
    }
    expect(explorationCastReason(caster, inventory, skill('resurrect'), { ...context, party: [caster] })).toBe('No fallen allies');
    expect(explorationCastReason(full, inventory, skill('teleport'), { ...context, party: [full] })).toBeUndefined();
  });
});
