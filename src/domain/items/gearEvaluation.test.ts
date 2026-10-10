import { describe, expect, it } from 'vitest';
import type { ActorState, ItemStats } from '../types';
import { damageRange, rollDamage } from '../combat/stats';
import { BALANCED_GEAR_POLICY, evaluateGearUpgrade, evaluateLoadoutChange, getLoadoutMetrics } from './gearEvaluation';
import { autoEquipBestGear, getEffectiveActor, junkItemsForSale, sellJunkItems, setInventoryPolicy } from './inventory';
import { assignWeapons, gear, inventoryGame } from './__tests__/fixtures';

function compare(before: ItemStats, after: ItemStats, hero = 0) {
  const items = [gear('current', before), gear('candidate', after)];
  const game = assignWeapons(inventoryGame(items), ['current', 'current', 'current']);
  return evaluateGearUpgrade(game.party[hero], items[1], items);
}

describe('authoritative gear evaluation', () => {
  it('uses actual damage rolls and the entire effective loadout', () => {
    const items = [gear('weapon', { strength: 10, baseDamage: 3 }), gear('ring', { strength: 12, vitality: 5, intellect: 9 }, { slot: 'ring' })];
    const game = inventoryGame(items);
    const actor = { ...game.party[0], equipment: { weapon: 'weapon', ring: 'ring' } };
    const effective = getEffectiveActor(actor, game.inventory);
    const average = actor.skills.reduce((sum, skill) => {
      const { max } = damageRange(effective, skill.id);
      const damage = Array.from({ length: max }, (_, i) => rollDamage(effective, skill.id, () => i / max + 1e-10));
      return sum + damage.reduce((a, b) => a + b, 0) / max;
    }, 0) / actor.skills.length;
    expect(getLoadoutMetrics(actor, items)).toEqual({ offense: average, hp: 120, mana: 0 });
  });

  it('follows strength for warrior, intellect for mage and healer, without role pigeonholes', () => {
    expect(compare({ intellect: 20 }, { strength: 20 }).decision).toBe('upgrade');
    expect(compare({ strength: 20 }, { intellect: 20 }).decision).toBe('obsolete');
    for (const index of [1, 2]) expect(compare({ strength: 20 }, { intellect: 20 }, index).decision).toBe('upgrade');
    const items = [gear('intellect', { intellect: 20 }), gear('strength', { strength: 20 })];
    const game = inventoryGame(items);
    const actor: ActorState = { ...game.party[0], combat: { ...game.party[0].combat, scaleWith: 'intellect' }, skills: [{ id: 'arcaneBlast', cooldown: 0 }] };
    expect(evaluateGearUpgrade(actor, items[0], items).after.offense).toBeGreaterThan(evaluateGearUpgrade(actor, items[1], items).after.offense);
    const strengthCaster = { ...game.party[0], skills: actor.skills };
    expect(evaluateGearUpgrade(strengthCaster, items[0], items).deltas.offense).toBeGreaterThan(0);
  });

  it('counts useful support mana but does not invent warrior mana or intellect healing output', () => {
    expect(compare({}, { maxMp: 50 }).decision).toBe('equivalent');
    expect(compare({}, { maxMp: 50 }, 2).decision).toBe('upgrade');
    const items = [gear('mana', { intellect: 20 })];
    const base = inventoryGame(items).party[0];
    const support = { ...base, skills: [{ id: 'heal' as const, cooldown: 0 }] };
    const result = evaluateGearUpgrade(support, items[0], items);
    expect(result.deltas).toEqual({ offense: 0, hp: 0, mana: 40 });
    expect(result.decision).toBe('upgrade');
  });

  it('rejects losing five base damage for one HP and sells that tradeoff across all rarities', () => {
    for (const rarity of ['common', 'magic', 'rare', 'legendary'] as const) {
      const items = [gear('current', { baseDamage: 10 }), gear('bad-trade', { baseDamage: 5, maxHp: 1 }, { rarity })];
      const initial = assignWeapons(inventoryGame(items, { mode: 'town' }), ['current']);
      const game = setInventoryPolicy({ ...initial, party: initial.party.slice(0, 1) }, { autoStash: false, autoRestock: false });
      expect(evaluateGearUpgrade(game.party[0], items[1], items).decision).toBe('obsolete');
      expect(autoEquipBestGear(game)).toBe(game);
      expect(junkItemsForSale(game)).toEqual([items[1]]);
      expect(sellJunkItems(game).inventory.items).toEqual([items[0]]);
    }
  });

  it('accepts meaningful durability trades but enforces hard offense and HP loss guards', () => {
    const balanced = compare({ baseDamage: 10 }, { baseDamage: 9, maxHp: 25 });
    expect(balanced.relative.offense).toBeLessThan(0);
    expect(balanced.decision).toBe('upgrade');
    expect(balanced.reasons).toEqual(['balanced-tradeoff']);
    expect(compare({ baseDamage: 10 }, { baseDamage: 0, maxHp: 1000 }).reasons).toContain('offense-loss-limit');
    expect(compare({ maxHp: 100 }, { baseDamage: 1000 }).reasons).toContain('hp-loss-limit');
  });

  it('requires meaningful offense compensation for HP loss, not just more mana', () => {
    expect(compare({ maxHp: 10 }, { baseDamage: 1 }).reasons).toContain('insufficient-offense-compensation');
    expect(compare({ maxHp: 10 }, { baseDamage: 10 }).decision).toBe('upgrade');
    expect(compare({ maxHp: 10 }, { maxMp: 100 }, 2).decision).toBe('obsolete');
    expect(compare({ maxMp: 100 }, { baseDamage: 100 }, 2).reasons).toContain('mana-loss-limit');
  });

  it('uses named configurable thresholds and a positive mixed benefit margin', () => {
    const items = [gear('current', { baseDamage: 10 }), gear('candidate', { baseDamage: 9, maxHp: 25 })];
    const actor = assignWeapons(inventoryGame(items), ['current']).party[0];
    expect(evaluateGearUpgrade(actor, items[1], items, { ...BALANCED_GEAR_POLICY, mixedBenefitMargin: 1 }).reasons).toContain('insufficient-benefit');
    expect(evaluateGearUpgrade(actor, items[1], items, { ...BALANCED_GEAR_POLICY, maxOffenseLoss: 0 }).reasons).toContain('offense-loss-limit');
  });

  it('does not cycle accepted mixed tradeoffs, or prefer equivalent rarity', () => {
    const items = [gear('current', { baseDamage: 10 }), gear('candidate', { baseDamage: 9, maxHp: 25 })];
    const actor = assignWeapons(inventoryGame(items), ['current']).party[0];
    const changed = { ...actor, equipment: { weapon: 'candidate' } };
    const forward = evaluateLoadoutChange(actor, changed, items);
    const backward = evaluateLoadoutChange(changed, actor, items);
    expect(forward.decision).toBe('upgrade');
    expect(backward.benefit).toBeCloseTo(-forward.benefit);
    expect(backward.decision).toBe('obsolete');
    const equal = { ...items[0], id: 'legendary', rarity: 'legendary' as const };
    expect(evaluateGearUpgrade(actor, equal, [...items, equal]).decision).toBe('equivalent');
  });

  it('retains only positive tradeoffs with auto-equip off and equips them before selling when on', () => {
    const items = [gear('current', { baseDamage: 10 }), gear('durable', { baseDamage: 9, maxHp: 25 }), gear('bad-trade', { baseDamage: 5, maxHp: 1 })];
    const base = assignWeapons(inventoryGame(items, { mode: 'town' }), ['current']);
    const game = setInventoryPolicy({ ...base, party: base.party.slice(0, 1) }, { autoEquip: false });
    expect(junkItemsForSale(game).map((item) => item.id)).toEqual(['bad-trade']);
    const sold = sellJunkItems(setInventoryPolicy(game, { autoEquip: true }));
    expect(sold.party[0].equipment.weapon).toBe('durable');
    expect(sold.inventory.items.map((item) => item.id)).toEqual(['durable']);
    expect(sellJunkItems(sold)).toBe(sold);
  });
});
