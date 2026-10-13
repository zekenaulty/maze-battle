import { test, expect } from '@playwright/test';
import type {} from './canonical-quality-fixture';

for (const phase of ['running', 'qualified']) test(`unrelated writes preserve ${phase} namespace witnesses`, async ({ page }) => {
  const result = await page.evaluate(async phase => {
    const c = window.canonicalQuality; await c.seedWorld(781, 8); await c.begin(); await c.advance(undefined, 1);
    if (phase === 'qualified') await c.finishQuality();
    const initial = await c.state(), before = initial.value;
    const witnesses = () => c.readCanonical(async pages => {
      const result = [];
      for (const prefix of ['space/', 'ports/', 'join/', 'connection/', 'quality/node/']) {
        result.push(await pages.witness('world', `dungeon/1/${prefix}`));
      }
      return result;
    });
    const prior = (await witnesses()).value;
    await c.executeCanonical(await c.request('fixture.unrelated'), async ({ pages }) => {
      await c.roles.beginWorldRoomRoles(pages, 1); await c.roles.advanceWorldRoomRoles(pages, 1);
      for (const key of ['dungeon/1/content/room', 'dungeon/1/mutation/room', 'dungeon/1/quality/node',
        'dungeon/1/quality/node-other/x', 'dungeon/10/space/x', 'dungeon/2/connection/x']) await pages.set('world', key, {});
      await pages.set('world', 'unrelated', {}, ['dungeon/1/space/fake', 'dungeon/1/quality/node/fake']);
      await pages.set('knowledge', 'dungeon/1/space/fake', {});
      return null;
    });
    const after = (await c.state()).value, next = (await witnesses()).value;
    const startAgain = (await c.begin()).receipt.result;
    await c.finishQuality();
    const ready = (await c.readCanonical(pages => c.quality.requireWorldFloorQuality(pages, 1))).value;
    const snapshot = await c.snapshot();
    const past = await c.readCanonical(pages => pages.witness('world', 'dungeon/1/space/'), { snapshot: initial.snapshot });
    return { before, after, prior, next, startAgain, ready, unchanged: JSON.stringify(snapshot) === JSON.stringify(await c.snapshot()), past: past.value };
  }, phase);
  expect(result.next).toEqual(result.prior); expect(result.after).toEqual(result.before);
  expect(result.startAgain).toEqual(result.before); expect(result.ready.status).toBe('qualified');
  expect(result.unchanged).toBe(true); expect(result.past).toBe(result.prior[0]);
});

test('primary witness pins unindexed records, not only secondary indexes', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalQuality; await c.seedWorld(781, 8, 'direct');
    const reversion = async () => c.executeCanonical(await c.request('fixture.unindexed'), async ({ pages }) => {
      const key = 'dungeon/1/connection/socket-6:door', row = await pages.get('world', key);
      if (!row) throw Error('Fixture connection is required');
      await pages.set('world', key, row.value, []); return null;
    });
    await reversion(); await c.finishQuality(); await reversion();
    return c.rejections();
  });
  for (const failure of result.failures) {
    expect(failure.error).toContain('quality binding'); expect(failure.after).toEqual(result.before);
  }
});
