import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemInstance } from '../domain/types';
import { getStackSellValue, saleDisabledReason } from './inventorySales';
import { characterFixture, inventoryFixture, itemFixture } from './characterTestFixtures';
import { DEFAULT_INVENTORY_FILTERS, projectInventory } from './inventoryView';

const pricing = vi.hoisted(() => vi.fn());
vi.mock('../domain/items/inventory', async (original) => ({ ...await original<typeof import('../domain/items/inventory')>(), getSellValue: pricing }));
beforeEach(() => pricing.mockReset());

describe('inventory sale projection', () => {
  it('delegates quantity quotes and the complete legacy record to the domain', () => {
    const item = { ...itemFixture({ quantity: 5 }), stackSellValue: 18 };
    pricing.mockReturnValue(11);
    expect(getStackSellValue(item, 3)).toBe(11);
    expect(pricing).toHaveBeenCalledExactlyOnceWith(item, 3);
    expect(item.stackSellValue).toBe(18);
  });

  it('protects equipped, locked, quest and malformed prices', () => {
    const item = itemFixture();
    expect(saleDisabledReason(item, true)).toBe('Unequip before selling');
    expect(saleDisabledReason({ ...item, locked: true })).toBe('Unlock before selling');
    expect(saleDisabledReason({ ...item, category: 'quest' as ItemInstance['category'] })).toBe('Not sellable');
    expect(saleDisabledReason({ ...item, value: Infinity })).toBe('Invalid sale value');
    expect(saleDisabledReason({ ...item, value: -1 })).toBe('Invalid sale value');
    expect(saleDisabledReason({ ...item, stackSellValue: NaN } as ItemInstance)).toBe('Invalid sale value');
    expect(saleDisabledReason(item)).toBeUndefined();
  });

  it('blocks consumable identity collisions across pack and stash, not only equipment comparisons', () => {
    const item = itemFixture({ category: 'consumable', slot: undefined, quantity: 3 });
    const inventory = inventoryFixture([item]);
    const actor = characterFixture();
    const [row] = projectInventory(inventory, [actor], actor, DEFAULT_INVENTORY_FILTERS, { capacity: 96, items: [{ ...item }] });
    expect(row.comparison).toBeUndefined();
    expect(row.saleDisabledReason).toBe('Duplicate item identity');
  });
});
