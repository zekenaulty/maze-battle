import { describe, expect, it } from 'vitest';
import { SKILLS } from '../domain/combat/skillCatalog';
import { damageRange } from '../domain/combat/stats';
import { getEffectiveActor } from '../domain/items/inventory';
import type { SkillId } from '../domain/types';
import { projectCharacter } from './characterSheet';
import { projectSkill, skillEffect } from './characterSkills';
import { characterFixture, inventoryFixture, itemFixture } from './characterTestFixtures';

describe('character projections', () => {
  it('separates base and effective stats including indirect vitality/intellect bonuses', () => {
    const item = itemFixture({ stats: { vitality: 3, intellect: 4, maxHp: 5 }, affixes: [{ id: 'edge', name: 'Edge', stats: { baseDamage: 2 } }], legendaryPower: { id: 'custom', name: 'Custom', description: 'Stat bonus.', stats: { strength: 2 } } });
    const actor = characterFixture({ equipment: { weapon: item.id } });
    const before = JSON.stringify(actor);
    const sheet = projectCharacter(actor, inventoryFixture([item]));
    expect(sheet.stats.find((stat) => stat.key === 'maxHp')).toMatchObject({ base: 100, gear: 11, effective: 111 });
    expect(sheet.stats.find((stat) => stat.key === 'maxMp')).toMatchObject({ base: 20, gear: 8, effective: 28 });
    expect(sheet.stats.find((stat) => stat.key === 'baseDamage')).toMatchObject({ base: 10, gear: 2, effective: 12 });
    expect(sheet.stats.find((stat) => stat.key === 'strength')?.gear).toBe(2);
    expect(sheet.xpRequired).toBe(107);
    expect(sheet.xpRemaining).toBe(87);
    expect(JSON.stringify(actor)).toBe(before);
  });

  it('uses the catalog costs and timing and the engine damage ranges for every damage skill', () => {
    const item = itemFixture();
    const actor = characterFixture({ equipment: { weapon: item.id } });
    const inventory = inventoryFixture([item]);
    for (const definition of Object.values(SKILLS)) {
      const skill = projectSkill(actor, inventory, { id: definition.id, cooldown: 0 }, 1000)!;
      expect(skill.mpCost).toBe(definition.mpCost);
      expect(skill.cooldownMs).toBe(definition.cooldownMs);
      if (definition.target === 'enemy' || definition.target === 'allEnemies') {
        const range = damageRange(getEffectiveActor(actor, inventory), definition.id);
        expect(skill.effect).toContain(`${range.min}-${range.max} damage`);
      }
    }
    expect(skillEffect(actor, 'wand')).toContain('Restores 10 MP');
    expect(skillEffect(actor, 'heal')).toContain('35%');
    expect(skillEffect(actor, 'groupHeal')).toContain('25%');
    expect(skillEffect(actor, 'resurrect')).toContain('50%');
    expect(skillEffect(actor, 'teleport')).toContain('random location in the maze, not to town');
    expect(projectSkill(actor, inventory, { id: 'teleport', cooldown: 0 }, 1000)?.status).toBe('Needs 5 MP');
    expect(projectSkill(actor, inventory, { id: 'unknown' as SkillId, cooldown: 0 }, 1000)).toBeUndefined();
  });

  it('projects elapsed charge restoration and the next recharge without mutating saved timers', () => {
    const state = { id: 'cleave' as const, cooldown: 0, charges: 0, maxCharges: 3, rechargeUntil: 1000, cooldownUntil: 1500 };
    const actor = characterFixture();
    const inventory = inventoryFixture();
    expect(projectSkill(actor, inventory, state, 1200)).toMatchObject({ charges: 1, rechargeRemainingMs: 2300, status: 'Cooldown 0.3s' });
    expect(projectSkill(actor, inventory, state, 3600)).toMatchObject({ charges: 2, rechargeRemainingMs: 2400, status: 'Ready' });
    expect(projectSkill(actor, inventory, state, 6000)).toMatchObject({ charges: 3, rechargeRemainingMs: 0 });
    expect(state.charges).toBe(0);
    expect(projectSkill({ ...actor, mp: 1 }, inventory, { id: 'heal', cooldown: 0 }, 1000)?.status).toBe('Needs 3 MP');
    expect(projectSkill({ ...actor, hp: 0 }, inventory, state, 6000)?.status).toBe('Fallen');
  });
});
