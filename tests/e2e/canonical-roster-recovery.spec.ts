import { test, expect } from './canonical-test';

test('failure after staging the item effect rolls back stock, gold, head and receipt', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, r = c.roster; const { head } = await r.seed('town');
    const before = await c.dump(); let error = '';
    try {
      await c.executeCanonical(c.command(head, 'fixture.fail'), async tx => {
        await r.commitRosterCommand(tx, { kind: 'sell', itemId: 'health-herb', amount: 1 }); throw Error('injected after effect');
      });
    } catch (e) { error = String(e); }
    return { error, unchanged: before.content === (await c.dump()).content };
  });
  expect(result.error).toContain('injected after effect'); expect(result.unchanged).toBe(true);
});

test('request mutation after submission cannot change its committed effect', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, r = c.roster; const { head } = await r.seed('town');
    const request = c.command(head, 'roster.command', { kind: 'sell', itemId: 'health-herb', amount: 1 }), original = structuredClone(request);
    const work = r.executeRosterCommand(request); request.input = { kind: 'sell', itemId: 'town-portal', amount: 1 };
    const outcome = await work, retry = await r.executeRosterCommand(original);
    return { outcome: outcome.receipt, retry: retry.receipt, state: (await r.read()).value.state };
  });
  expect(result.retry).toEqual(result.outcome);
  expect(result.state.inventory.items.map(item => item.id)).toEqual(['mana-vial', 'town-portal']);
});

test('takeover fences new actions but permits exact reconciliation of the original sale', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, r = c.roster; await r.seed('town');
    const sale = await r.act({ kind: 'sell', itemId: 'health-herb', amount: 1 });
    const { head } = await c.readCanonicalHead();
    await c.controlCanonical(c.command(head, 'control.takeover', { owner: 'second' }), 'takeover');
    let denied = '';
    try { await r.executeRosterCommand({ ...sale.request, attemptId: 'stale-new-sale' }); } catch (e) { denied = String(e); }
    return { denied, retry: (await r.executeRosterCommand(sale.request)).replayed };
  });
  expect(result.denied).toContain('stale owner'); expect(result.retry).toBe(true);
});

test('historical roster reads retain custody and balances without adopting later changes', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, r = c.roster; const { head } = await r.seed('town'); const snapshot = c.snapshotOf(head);
    await r.act({ kind: 'sell', itemId: 'health-herb', amount: 1 });
    const old = await c.readCanonical((pages, view) => r.loadRoster(pages, r.rosterContext(r.gameCheckpoint(view.checkpoint))), { snapshot });
    return { old: old.value.state.inventory, current: (await r.read()).value.state.inventory };
  });
  expect(result.old.items.map(item => item.id)).toContain('health-herb'); expect(result.old.gold).toBe(35);
  expect(result.current.items.map(item => item.id)).not.toContain('health-herb'); expect(result.current.gold).toBeGreaterThan(35);
});

for (const corruption of ['missing-item', 'missing-policy', 'wrong-owner', 'invalid-gold', 'dangling-equipment'] as const)
  test(`rejects ${corruption} instead of normalizing or dropping stock`, async ({ page }) => {
    const result = await page.evaluate(async corruption => {
      const c = window.canonical, r = c.roster; const { head } = await r.seed('town');
      await c.executeCanonical(c.command(head), async tx => {
        if (corruption === 'missing-item' || corruption === 'missing-policy') {
          await tx.pages.delete('world', corruption === 'missing-item' ? 'roster/item/health-herb' : 'roster/policy'); return {};
        }
        const key = corruption === 'wrong-owner' ? 'roster/item/health-herb' : corruption === 'invalid-gold' ? 'roster/pack' : 'roster/actor/fixture-world-warrior';
        const record = (await tx.pages.get('world', key))!, value = record.value as Record<string, any>;
        if (corruption === 'wrong-owner') value.owner = { kind: 'stash' };
        if (corruption === 'invalid-gold') value.gold = -1;
        if (corruption === 'dangling-equipment') value.actor.equipment = { weapon: 'not-owned' };
        await tx.pages.set('world', key, value, record.indexes); return {};
      });
      const before = await c.dump(); let readError = '', commandError = '';
      try { await r.read(); } catch (e) { readError = String(e); }
      try { await r.act({ kind: 'rest' }); } catch (e) { commandError = String(e); }
      return { readError, commandError, unchanged: before.content === (await c.dump()).content };
    }, corruption);
    expect(result.readError).toContain('Canonical storage:'); expect(result.commandError).toContain('Canonical storage:'); expect(result.unchanged).toBe(true);
  });
