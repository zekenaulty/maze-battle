import { describe, expect, it } from 'vitest';
import type { ItemCategory } from '../types';
import { normalizeGameState } from '../gameFactory';
import { junkItemsForSale, manageAutoInventory, normalizeInventory, sellItem, sellJunkItems, setInventoryPolicy, stashItem, withdrawStashItem } from './inventory';
import { consumeStackItem, itemQuantity, mergeInventoryItems, stackInventoryItems } from './itemStacks';
import { getSellValue } from './itemValue';
import { createItemInstance } from './loot';
import { gear, inventoryGame, supply } from './__tests__/fixtures';

const totalValue = (items: ReturnType<typeof stackInventoryItems>) => items.reduce((sum, item) => sum + getSellValue(item, itemQuantity(item)), 0);

describe('effect-based supply stacks and exact quantity sales', () => {
  it('generates the same supply potency, level and value on every floor without flattening gear', () => {
    for (const base of ['health-herb', 'mana-vial', 'town-portal']) {
      const first = createItemInstance(base, 1);
      const deep = createItemInstance(base, 99);
      expect(deep).toMatchObject({ itemLevel: 1, value: first.value, consumableEffect: first.consumableEffect });
      expect(deep.consumableAmount).toBe(first.consumableAmount);
      expect(stackInventoryItems([first, deep])).toHaveLength(1);
    }
    expect(createItemInstance('iron-sword', 99).itemLevel).toBe(99);
  });

  it('merges legacy floor levels and prices without losing quantity or resale gold across reload', () => {
    const low = supply('health-herb', 3, { id: 'first', itemLevel: 1, value: 8 });
    const high = supply('health-herb', 2, { id: 'later', itemLevel: 19, value: 44 });
    const original = inventoryGame([], { inventory: { capacity: 1, gold: 0, items: [low, high] } });
    const next = normalizeGameState(JSON.parse(JSON.stringify(original)));
    expect(next.inventory.items).toMatchObject([{ id: 'first', quantity: 5 }]);
    expect(totalValue(next.inventory.items)).toBe(56);
    expect(normalizeGameState(JSON.parse(JSON.stringify(next))).inventory).toEqual(next.inventory);
    expect(normalizeInventory({ capacity: 1, items: next.inventory.items }).items).toEqual(next.inventory.items);
  });

  it('keeps stronger, locked, quest, decorated and ambiguous records separate', () => {
    const first = supply('health-herb', 1, { id: 'first' });
    const different = [
      { ...first, id: 'stronger', consumableAmount: 100 },
      { ...first, id: 'locked', locked: true },
      { ...first, id: 'quest', category: 'quest' as ItemCategory },
      { ...first, id: 'power', legendaryPower: { id: 'unique', name: 'Unique', description: 'Special effect' } },
    ];
    expect(stackInventoryItems([first, ...different])).toHaveLength(5);
    const duplicates = [{ ...first, id: 'collision' }, { ...first, id: 'collision' }];
    expect(stackInventoryItems(duplicates)).toEqual(duplicates);
  });

  it('admits same-effect legacy supplies to a full bag and rejects different potency', () => {
    const first = supply('health-herb', 2);
    const incoming = supply('health-herb', 4, { itemLevel: 80, value: 166 });
    const merged = mergeInventoryItems({ capacity: 1, items: [first] }, [incoming]);
    expect(merged.accepted).toHaveLength(1);
    expect(merged.inventory.items[0].quantity).toBe(6);
    expect(totalValue(merged.inventory.items)).toBe(totalValue([first, incoming]));
    expect(mergeInventoryItems(merged.inventory, [{ ...incoming, id: 'stronger', consumableAmount: 100 }]).rejected).toHaveLength(1);
  });

  it('sells one, an exact quantity, and all with exact quotes and no repeated credit', () => {
    const herb = stackInventoryItems([supply('health-herb', 3), supply('health-herb', 2, { value: 44 })])[0];
    let game = inventoryGame([herb], { mode: 'town' });
    const expected = getSellValue(herb, 5);
    let quoted = getSellValue(game.inventory.items[0]);
    game = sellItem(game, herb.id);
    expect(game.inventory.gold).toBe(quoted);
    expect(game.inventory.items[0].quantity).toBe(4);
    quoted += getSellValue(game.inventory.items[0], 2);
    game = sellItem(game, herb.id, 2);
    expect(game.inventory.gold).toBe(quoted);
    expect(game.inventory.items[0].quantity).toBe(2);
    game = sellItem(game, herb.id, 2);
    expect(game.inventory.items).toEqual([]);
    expect(game.inventory.gold).toBe(expected);
    expect(sellItem(game, herb.id, 2)).toBe(game);
  });

  it('selling every unit singly yields exactly the same gold as Sell All', () => {
    const herb = stackInventoryItems([supply('health-herb', 5), supply('health-herb', 2, { value: 49 })])[0];
    const game = inventoryGame([herb], { mode: 'town' });
    const all = sellItem(game, herb.id, 7);
    let single = game;
    for (let i = 0; i < 7; i++) single = sellItem(single, herb.id);
    expect(single.inventory).toEqual(all.inventory);
  });

  it.each([0, -1, 1.5, Infinity, NaN, 6])('rejects invalid/stale sale quantity %s atomically', (amount) => {
    const herb = supply('health-herb', 5);
    const game = inventoryGame([herb], { mode: 'town' });
    expect(sellItem(game, herb.id, amount)).toBe(game);
  });

  it('protects locked, equipped, quest, ambiguous and invalid-price records', () => {
    const locked = supply('health-herb', 3, { locked: true });
    const quest = supply('health-herb', 3, { category: 'quest' as ItemCategory });
    const invalid = supply('health-herb', 3, { value: NaN });
    const badTotal = supply('health-herb', 3, { stackSellValue: Infinity });
    const equipped = gear('worn', {});
    const game = inventoryGame([locked, quest, invalid, badTotal, equipped], { mode: 'town' });
    game.party[0].equipment.weapon = equipped.id;
    for (const item of game.inventory.items) expect(sellItem(game, item.id, itemQuantity(item))).toBe(game);
    const collision = { ...game, stash: { capacity: 96, items: [equipped] } };
    expect(sellItem(collision, equipped.id)).toBe(collision);
    const overflow = inventoryGame([supply('health-herb')], { mode: 'town' });
    overflow.inventory.gold = Number.MAX_SAFE_INTEGER;
    expect(sellItem(overflow, overflow.inventory.items[0].id)).toBe(overflow);
  });

  it('does not credit malformed null quantities or silently reinterpret null stack values', () => {
    const nullQuantity = JSON.parse(JSON.stringify({ ...supply('health-herb'), quantity: null }));
    const nullValue = JSON.parse(JSON.stringify({ ...supply('health-herb', 3), stackSellValue: null }));
    const game = inventoryGame([], { mode: 'town', inventory: { capacity: 36, gold: 0, items: [nullQuantity, nullValue] } });
    expect(getSellValue(nullQuantity)).toBe(0);
    expect(getSellValue(nullValue)).toBe(0);
    for (let i = 0; i < 2; i++) {
      expect(sellItem(game, nullQuantity.id)).toBe(game);
      expect(sellItem(game, nullValue.id)).toBe(game);
    }
    expect(stackInventoryItems(game.inventory.items)).toEqual(game.inventory.items);
    expect(consumeStackItem([nullValue], nullValue.id)[0].stackSellValue).toBeNull();
  });

  it('bulk junk sale preserves invalid records and refuses unsafe wallet totals atomically', () => {
    const malformed = JSON.parse(JSON.stringify({ ...gear('bad-value', {}), stackSellValue: null }));
    const huge = gear('unsafe-value', {}, { value: Number.MAX_VALUE });
    let game = setInventoryPolicy(inventoryGame([malformed, huge], { mode: 'town' }), { autoEquip: false });
    expect(junkItemsForSale(game)).toEqual([]);
    expect(sellJunkItems(game)).toBe(game);
    game = { ...game, inventory: { capacity: 36, gold: Number.MAX_SAFE_INTEGER - 1, items: [gear('junk', {})] } };
    expect(sellJunkItems(game)).toBe(game);
    expect(sellJunkItems({ ...game, inventory: { ...game.inventory, gold: 0.5 } }).inventory.items).toHaveLength(1);
  });

  it('conserves legacy value when auto care splits reserves between pack and stash', () => {
    const items = [supply('health-herb', 3), supply('health-herb', 7, { itemLevel: 19, value: 44 })];
    const game = setInventoryPolicy(inventoryGame([], { mode: 'town', inventory: { capacity: 36, gold: 0, items } }), { autoRestock: false });
    const next = manageAutoInventory(game);
    expect(next.inventory.items[0].quantity).toBe(3);
    expect(next.stash.items[0].quantity).toBe(7);
    expect(totalValue([...next.inventory.items, ...next.stash.items])).toBe(totalValue(items));
    const stashed = stashItem(next, next.inventory.items[0].id);
    expect(stashed.inventory.items).toHaveLength(0);
    expect(totalValue(stashed.stash.items)).toBe(totalValue(items));
    const withdrawn = withdrawStashItem(stashed, stashed.stash.items[0].id);
    expect(totalValue(withdrawn.inventory.items)).toBe(totalValue(items));
    expect(withdrawn.stash.items).toHaveLength(0);
  });

  it('consumption debits only the consumed portion of a merged stack', () => {
    const herb = stackInventoryItems([supply('health-herb', 3), supply('health-herb', 2, { value: 44 })])[0];
    const remainder = consumeStackItem([herb], herb.id, 2);
    expect(itemQuantity(remainder[0])).toBe(3);
    expect(totalValue(remainder) + getSellValue(herb, 2)).toBe(getSellValue(herb, 5));
  });
});
