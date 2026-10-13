import { test, expect } from './canonical-test';

test('equipped gear is character-owned, leaves the pack slot count, and survives reload', async ({ page }) => {
  await page.evaluate(async () => {
    const r = window.canonical.roster;
    await r.seed('town', [{ ...r.createItemInstance('rusty-sword', 1), id: 'sword' }]);
    await r.act({ kind: 'equip', actorId: 'fixture-world-warrior', itemId: 'sword' });
  });
  await page.reload(); await page.waitForFunction(() => !!window.canonical);
  const read = await page.evaluate(() => window.canonical.roster.read());
  expect(read.value.state.inventory.items).toHaveLength(4);
  expect(read.value.packSlots).toBe(3);
  expect(read.value.owners.find(item => item.id === 'sword')?.owner).toEqual({ kind: 'equipped', actorId: 'fixture-world-warrior', slot: 'weapon' });
  expect(read.value.state.party[0].equipment.weapon).toBe('sword');
});

test('equipment replacements release all ownership indexes before assigning earlier stock', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const r = window.canonical.roster;
    await r.seed('town', ['first', 'second'].map(id => ({ ...r.createItemInstance('rusty-sword', 1), id })));
    await r.act({ kind: 'equip', actorId: 'fixture-world-warrior', itemId: 'second' });
    await r.act({ kind: 'equip', actorId: 'fixture-world-warrior', itemId: 'first' });
    await r.act({ kind: 'equip', actorId: 'fixture-world-mage', itemId: 'first' });
    return (await r.read()).value;
  });
  expect(result.state.party[0].equipment.weapon).toBeUndefined();
  expect(result.state.party[1].equipment.weapon).toBe('first');
  expect(result.owners.find(item => item.id === 'second')?.owner).toEqual({ kind: 'pack' });
});

test('full pack prevents unequipping without losing or duplicating gear', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const r = window.canonical.roster;
    await r.seed('town', Array.from({ length: 34 }, (_, i) => ({ ...r.createItemInstance('rusty-sword', 1), id: `sword-${i}` })));
    await r.act({ kind: 'equip', actorId: 'fixture-world-warrior', itemId: 'sword-0' });
    const before = (await r.read()).value;
    const outcome = await r.act({ kind: 'unequip', actorId: 'fixture-world-warrior', slot: 'weapon' });
    return { before, after: (await r.read()).value, result: outcome.outcome.receipt.result };
  });
  expect(result.before.packSlots).toBe(36); expect(result.after).toEqual(result.before);
  expect(result.result).toEqual({ kind: 'unequip', outcome: 'unchanged' });
});

test('partial and whole stack sales preserve unrelated rows and exact retry sells only once', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, r = c.roster;
    await r.seed('town');
    await r.edit(s => ({ ...s, inventory: { ...s.inventory, items: s.inventory.items.map(item => item.id === 'health-herb' ? { ...item, quantity: 8 } : item) } }));
    const untouched = () => c.readCanonical(async p => ({ item: await p.get('world', 'roster/item/mana-vial'), actor: await p.get('world', 'roster/actor/fixture-world-warrior'), room: await p.get('world', 'dungeon/1/space/entry') }));
    const before = (await untouched()).value;
    const sale = await r.act({ kind: 'sell', itemId: 'health-herb', amount: 3 });
    const partial = (await r.read()).value.state.inventory;
    const retry = await r.executeRosterCommand(sale.request);
    await r.act({ kind: 'sell', itemId: 'health-herb', amount: 5 });
    const after = (await r.read()).value.state.inventory;
    return { partial, after, retry: retry.replayed, first: sale.outcome.receipt, replay: retry.receipt, before, untouched: (await untouched()).value };
  });
  expect(result.partial.items.find(item => item.id === 'health-herb')?.quantity).toBe(5);
  expect(result.after.items.some(item => item.id === 'health-herb')).toBe(false);
  expect(result.retry).toBe(true); expect(result.replay).toEqual(result.first); expect(result.after.gold).toBeGreaterThan(result.partial.gold);
  expect(result.untouched).toEqual(result.before);
});

test('stash merges stock and withdrawal preserves order, value and counts', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const r = window.canonical.roster; await r.seed('town');
    await r.act({ kind: 'stash', itemId: 'health-herb' });
    await r.act({ kind: 'buy', vendor: 'alchemist', baseId: 'health-herb' });
    const bought = (await r.read()).value.state.inventory.items.find(item => item.baseId === 'health-herb')!;
    await r.act({ kind: 'stash', itemId: bought.id });
    const stashed = (await r.read()).value;
    await r.act({ kind: 'withdraw', itemId: 'health-herb' });
    return { stashed, returned: (await r.read()).value };
  });
  expect(result.stashed.state.stash.items).toHaveLength(1);
  expect(result.stashed.state.stash.items[0].quantity).toBe(2);
  expect(result.returned.state.stash.items).toEqual([]);
  expect(result.returned.state.inventory.items.map(item => item.baseId)).toEqual(['mana-vial', 'town-portal', 'health-herb']);
  expect(result.returned.state.inventory.items.at(-1)).toEqual(result.stashed.state.stash.items[0]);
});

test('quest and locked items cannot be sold and automatic policy is explicit', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const r = window.canonical.roster;
    await r.seed('town', [{ id: 'quest', baseId: 'guild-cache', displayName: 'Cache', token: 'Q', category: 'quest', questId: 'quest-1', rarity: 'common', itemLevel: 1, value: 999 },
      { ...r.createItemInstance('rusty-sword', 1), id: 'locked', locked: true }]);
    const before = (await r.read()).value;
    await r.act({ kind: 'sell', itemId: 'quest', amount: 1 }); await r.act({ kind: 'sell', itemId: 'locked', amount: 1 });
    await r.act({ kind: 'sell-junk' });
    return { before, after: (await r.read()).value };
  });
  expect(result.after).toEqual(result.before);
});
