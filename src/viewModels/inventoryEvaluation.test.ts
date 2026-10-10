import { describe, expect, it } from 'vitest';
import { evaluateGearUpgrade } from '../domain/items/gearEvaluation';
import { compareItem } from './inventoryComparison';
import { DEFAULT_INVENTORY_FILTERS, projectInventory } from './inventoryView';
import { characterFixture, inventoryFixture, itemFixture } from './characterTestFixtures';

describe('authoritative inventory recommendations', () => {
  const current = itemFixture({ id: 'current', stats: { baseDamage: 10 } });
  const actor = characterFixture({ equipment: { weapon: current.id } });
  const recommended = { ...DEFAULT_INVENTORY_FILTERS, ownership: 'upgrades' as const, sort: 'upgrade' as const };

  it('rejects a higher-GS five-damage loss for one HP and accepts a balanced tradeoff', () => {
    const rejected = itemFixture({ id: 'rejected', stats: { baseDamage: 5, maxHp: 1, intellect: 300 } });
    const durable = itemFixture({ id: 'durable', stats: { baseDamage: 9, maxHp: 25 } });
    const inventory = inventoryFixture([current, rejected, durable]);
    const snapshot = JSON.stringify({ actor, inventory });
    const bad = compareItem(rejected, actor, inventory)!;
    expect(bad.scoreDelta).toBeGreaterThan(0);
    expect(bad.evaluation).toEqual(evaluateGearUpgrade(actor, rejected, inventory.items));
    expect(bad.evaluation.decision).toBe('obsolete');
    expect(bad.evaluation.deltas.offense).toBeLessThan(0);
    expect(bad.evaluation.deltas.hp).toBe(1);
    expect(bad.evaluation.deltas.mana).toBe(0);
    expect(compareItem(durable, actor, inventory)!.evaluation.reasons).toEqual(['balanced-tradeoff']);
    expect(projectInventory(inventory, [actor], actor, recommended).map((row) => row.item.id)).toEqual([durable.id]);
    expect(JSON.stringify({ actor, inventory })).toBe(snapshot);
  });

  it('recommends actual learned-skill output even when role-weighted GS decreases', () => {
    const strength = itemFixture({ id: 'strength', stats: { strength: 20 } });
    const intellect = itemFixture({ id: 'intellect', stats: { intellect: 20 } });
    const caster = characterFixture({ combat: { baseDamage: 10, scaleWith: 'intellect' }, equipment: { weapon: strength.id }, skills: [{ id: 'wand', cooldown: 0 }] });
    const inventory = inventoryFixture([strength, intellect]);
    const comparison = compareItem(intellect, caster, inventory)!;
    expect(comparison.scoreDelta).toBeLessThan(0);
    expect(comparison.evaluation.decision).toBe('upgrade');
    expect(comparison.evaluation.deltas.offense).toBeGreaterThan(0);
    expect(projectInventory(inventory, [caster], caster, recommended).map((row) => row.item.id)).toEqual([intellect.id]);
  });

  it('uses the entire owned loadout including stash, affixes and legendary stats', () => {
    const ring = itemFixture({ id: 'ring', slot: 'ring', stats: { vitality: 5 }, affixes: [{ id: 'mana', name: 'Mana', stats: { maxMp: 4 } }], legendaryPower: { id: 'mind', name: 'Mind', description: 'Intellect', stats: { intellect: 2 } } });
    const candidate = itemFixture({ id: 'candidate', stats: { baseDamage: 11, maxHp: 3, maxMp: 6 } });
    const caster = { ...actor, equipment: { weapon: current.id, ring: ring.id }, skills: [{ id: 'wand' as const, cooldown: 0 }, { id: 'heal' as const, cooldown: 0 }] };
    const inventory = inventoryFixture([candidate]);
    const stash = { capacity: 96, items: [current, ring] };
    const [row] = projectInventory(inventory, [caster], caster, recommended, stash);
    expect(row.comparison!.currentName).toBe(current.displayName);
    expect(row.comparison!.evaluation).toEqual(evaluateGearUpgrade(caster, candidate, [...inventory.items, ...stash.items]));
    expect(row.comparison!.evaluation.before).toMatchObject({ hp: 110, mana: 28 });
    expect(row.comparison!.evaluation.deltas).toMatchObject({ hp: 3, mana: 6 });
    expect(row.comparison!.evaluation.deltas.offense).toBeGreaterThan(0);
    expect(inventory.items).toEqual([candidate]);
  });

  it('keeps equivalent, locked and ambiguous gear out of recommendations', () => {
    const equivalent = itemFixture({ id: 'equivalent', stats: current.stats });
    const locked = itemFixture({ id: 'locked', locked: true, stats: { baseDamage: 100 } });
    const duplicate = itemFixture({ id: 'duplicate', stats: { baseDamage: 100 } });
    const inventory = inventoryFixture([current, equivalent, locked, duplicate]);
    const stash = { capacity: 96, items: [{ ...duplicate }] };
    const rows = projectInventory(inventory, [actor], actor, DEFAULT_INVENTORY_FILTERS, stash);
    expect(rows.find((row) => row.item.id === equivalent.id)!.comparison!.evaluation.decision).toBe('equivalent');
    expect(rows.find((row) => row.item.id === locked.id)!.comparison!.evaluation.reasons).toEqual(['ineligible-item']);
    expect(rows.find((row) => row.item.id === duplicate.id)!.comparison!.evaluation.reasons).toEqual(['ambiguous-identity']);
    expect(projectInventory(inventory, [actor], actor, recommended, stash)).toEqual([]);
  });

  it('sorts accepted upgrades before rejected high-benefit or high-score trades', () => {
    const upgrade = itemFixture({ id: 'upgrade', stats: { baseDamage: 11 } });
    const tradeoff = itemFixture({ id: 'tradeoff', stats: { maxHp: 10000, intellect: 300 } });
    const inventory = inventoryFixture([current, tradeoff, upgrade]);
    expect(compareItem(tradeoff, actor, inventory)!.evaluation.benefit).toBeGreaterThan(compareItem(upgrade, actor, inventory)!.evaluation.benefit);
    expect(projectInventory(inventory, [actor], actor, { ...DEFAULT_INVENTORY_FILTERS, sort: 'upgrade' })[0].item.id).toBe(upgrade.id);
  });
});
