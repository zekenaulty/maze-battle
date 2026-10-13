import { test, expect } from '@playwright/test';
import type {} from './canonical-auto.fixture';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5221' ? route.continue() : route.abort());
  await page.goto('/tests/e2e/canonical-auto.fixture.html'); await page.waitForFunction(() => !!window.canonicalAuto);
});

test('real care rules act before guild acceptance and consume exactly one supply', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const a = window.canonicalAuto; await a.seed();
    await a.roster.edit(s => ({ ...s, party: s.party.map((actor, n) => n === 0 ? { ...actor, hp: 1 } : actor) }));
    const before = (await a.roster.read()).value.state, tick = await a.act(), after = (await a.roster.read()).value.state;
    const healing = (s: typeof before) => s.inventory.items.filter(i => i.consumableEffect === 'heal').reduce((total, i) => total + (i.quantity ?? 1), 0);
    return { action: tick.outcome.receipt.result, beforeHp: before.party[0].hp, afterHp: after.party[0].hp, used: healing(before) - healing(after),
      guild: (await a.readCanonical((p, s) => a.readAutoGuild(p, a.roster.gameCheckpoint(s.checkpoint)))).value };
  });
  expect(result.action).toMatchObject({ outcome: 'applied', rosterChanged: true, action: { kind: 'use', channel: 'roster' } });
  expect(result.afterHp).toBeGreaterThan(result.beforeHp); expect(result.used).toBe(1); expect(result.guild.active).toEqual([]);
});

test('town maintenance preserves locked inventory and parks Auto when the real pack stays full', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const a = window.canonicalAuto; await a.seed();
    await a.roster.edit(s => {
      if (!s.inventoryPolicy) throw Error('Fixture needs an inventory policy');
      return { ...s, inventory: { ...s.inventory, capacity: a.roster.packSlotUsage(s), items: s.inventory.items.map(i => ({ ...i, locked: true })) },
        inventoryPolicy: { ...s.inventoryPolicy, autoSellJunk: true, autoStash: true, autoRestock: true } };
    });
    const { head } = await a.readCanonicalHead();
    await a.executeCanonical(a.worldRequest(head, 'fixture.town'), async tx => {
      tx.setCheckpoint(a.roster.checkpointJson({ ...a.roster.gameCheckpoint(tx.head.checkpoint), mode: 'town', townReturnMode: 'auto-play' })); return {};
    });
    const before = (await a.roster.read()).value.state, maintain = await a.act(), stop = await a.act(), after = (await a.roster.read()).value.state;
    return { before, after, maintain: maintain.outcome.receipt.result, stop: stop.outcome.receipt.result };
  });
  expect(result.maintain).toMatchObject({ action: { kind: 'maintain-town', channel: 'roster' } });
  expect(result.stop).toMatchObject({ outcome: 'blocked' });
  expect(result.after.mode).toBe('town'); expect(result.after.townReturnMode).toBe('manual');
  expect(result.after.inventory.items.map(i => ({ ...i, quantity: i.quantity ?? 1 })))
    .toEqual(result.before.inventory.items.map(i => ({ ...i, quantity: i.quantity ?? 1 })));
  expect(result.after.party.map(a => a.equipment)).toEqual(result.before.party.map(a => a.equipment));
});
