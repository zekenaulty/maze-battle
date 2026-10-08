import { describe, expect, it } from 'vitest';
import { compareItem, consumableDisabledReason } from './inventoryComparison';
import { DEFAULT_INVENTORY_FILTERS, projectInventory } from './inventoryView';
import { characterFixture, inventoryFixture, itemFixture } from './characterTestFixtures';

describe('inventory projections', () => {
  const old = itemFixture({ id: 'old', displayName: 'Old Sword', stats: { baseDamage: 5, vitality: 3 } });
  const replacement = itemFixture({ stats: { baseDamage: 3, intellect: 4, maxHp: 10 }, locked: true });
  const potion = itemFixture({ id: 'potion', displayName: 'Health Herb', category: 'consumable', slot: undefined, stats: undefined, consumableEffect: 'heal', consumableAmount: 35 });
  const vor = characterFixture({ equipment: { weapon: old.id } });
  const mage = characterFixture({ id: 'zyth', displayName: 'Zyth', role: 'mage', equipment: { weapon: replacement.id } });
  const inventory = inventoryFixture([old, replacement, potion]);

  it('compares replacing the selected slot using effective stats and does not change ownership', () => {
    const original = JSON.stringify({ inventory, vor, mage });
    const comparison = compareItem(replacement, vor, inventory)!;
    expect(comparison.currentName).toBe('Old Sword');
    expect(comparison.deltas).toEqual(expect.arrayContaining([
      { key: 'maxHp', label: 'Max HP', value: 4 },
      { key: 'maxMp', label: 'Max MP', value: 8 },
      { key: 'baseDamage', label: 'Base damage', value: -2 },
    ]));
    const rows = projectInventory(inventory, [vor, mage], vor, DEFAULT_INVENTORY_FILTERS);
    expect(rows.find((row) => row.item.id === replacement.id)?.owner?.actor.id).toBe(mage.id);
    expect(compareItem(replacement, mage, inventory)).toMatchObject({ isCurrent: true, scoreDelta: 0, deltas: [] });
    expect(compareItem(potion, vor, inventory)).toBeUndefined();
    expect(JSON.stringify({ inventory, vor, mage })).toBe(original);
  });

  it('combines search, slot, rarity, ownership and role-relative upgrade filters', () => {
    const filter = (patch: Partial<typeof DEFAULT_INVENTORY_FILTERS>) => projectInventory(inventory, [vor, mage], vor, { ...DEFAULT_INVENTORY_FILTERS, ...patch }).map((row) => row.item.id);
    expect(filter({ query: 'ZYTH intellect', slot: 'weapon', rarity: 'common', ownership: 'locked' })).toEqual([replacement.id]);
    expect(filter({ ownership: 'selected' })).toEqual([old.id]);
    expect(filter({ category: 'consumable', ownership: 'unequipped' })).toEqual([potion.id]);
    expect(filter({ query: 'missing' })).toEqual([]);
    expect(filter({ ownership: 'upgrades' })).toEqual([]);
    expect(projectInventory(inventory, [vor, mage], { ...mage, equipment: {} }, { ...DEFAULT_INVENTORY_FILTERS, ownership: 'upgrades', sort: 'upgrade' })[0].item.id).toBe(replacement.id);
  });

  it('sorts descending numeric fields and keeps the source order untouched', () => {
    const high = itemFixture({ id: 'high', displayName: 'Top', rarity: 'legendary', itemLevel: 20, value: 500, stats: { baseDamage: 100 } });
    const pack = inventoryFixture([potion, replacement, high]);
    for (const sort of ['value', 'rarity', 'score', 'upgrade', 'level'] as const) expect(projectInventory(pack, [], vor, { ...DEFAULT_INVENTORY_FILTERS, sort })[0].item.id).toBe(high.id);
    expect(pack.items.map((item) => item.id)).toEqual([potion.id, replacement.id, high.id]);
  });

  it('disables wasteful consumables and respects portal context, not an invented revive rule', () => {
    expect(consumableDisabledReason(potion, { ...vor, hp: 100 })).toBe('HP at potion cap');
    expect(consumableDisabledReason(potion, { ...vor, hp: 0 })).toBeUndefined();
    expect(consumableDisabledReason({ ...potion, quantity: 0 }, vor)).toBe('Empty stack');
    expect(consumableDisabledReason({ ...potion, consumableEffect: 'townPortal' }, vor, false)).toBe('Portal unavailable here');
  });
});
