import { test, expect } from '@playwright/test';
import type {} from './canonical-quality-fixture';

test('incomplete generation cannot begin qualification or imply readiness', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalQuality; await c.seedWorld(42, 8, 'mixed', false); return c.rejections();
  });
  for (const failure of result.failures) {
    expect(failure.error).toContain('quality requires completed generation'); expect(failure.after).toEqual(result.before);
  }
});

for (const phase of ['running', 'qualified']) test(`changed generation rejects ${phase} state without restarting`, async ({ page }) => {
  const result = await page.evaluate(async phase => {
    const c = window.canonicalQuality; await c.seedWorld(781, 8); await c.begin();
    if (phase === 'qualified') await c.finishQuality(); else await c.advance(undefined, 1);
    await c.executeCanonical(await c.request('fixture.damage-floor'), async ({ pages }) => {
      const floor = await c.loadFloor(pages, 1); floor.generation.recipe.seed++;
      floor.generation.scopeId = JSON.stringify(floor.generation.recipe);
      await pages.set('world', 'dungeon/1', c.json(floor), ['floors/1']); return null;
    });
    return c.rejections();
  }, phase);
  for (const failure of result.failures) {
    expect(failure.error).toContain('binding'); expect(failure.after).toEqual(result.before);
  }
});

for (const key of ['quality', 'quality/progress', 'quality/node/24']) test(`missing established ${key} fails closed`, async ({ page }) => {
  const result = await page.evaluate(async key => {
    const c = window.canonicalQuality; await c.seedWorld(); await c.begin(); await c.advance(undefined, 1);
    await c.executeCanonical(await c.request('fixture.delete'), async ({ pages }) => { await pages.delete('world', `dungeon/1/${key}`); return null; });
    return c.rejections();
  }, key);
  for (const failure of result.failures) { expect(failure.error).not.toBeNull(); expect(failure.after).toEqual(result.before); }
});

for (const key of ['space/socket-23:room', 'ports/socket-23:room', 'join/socket-23', 'connection/socket-23:exit', 'space/socket-23:passage']) {
  test(`missing established topology ${key} rejects without regeneration`, async ({ page }) => {
    const result = await page.evaluate(async key => {
      const c = window.canonicalQuality; await c.seedWorld(781, 25, 'passage'); await c.begin();
      await c.executeCanonical(await c.request('fixture.delete'), async ({ pages }) => { await pages.delete('world', `dungeon/1/${key}`); return null; });
      const before = await c.snapshot(), error = await c.advance().catch(String); return { before, error, after: await c.snapshot() };
    }, key);
    expect(result.error).toContain('missing established'); expect(result.after).toEqual(result.before);
  });
}

test('nonreciprocal join encountered after staging a node rolls the entire batch back', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalQuality; await c.seedWorld(781, 25, 'passage'); await c.begin();
    await c.executeCanonical(await c.request('fixture.break-reciprocal'), async ({ pages }) => {
      const key = 'dungeon/1/connection/socket-22:exit', row = await pages.get('world', key);
      const value = row!.value as unknown as { connection: { to: { row: number } } };
      value.connection.to.row++; await pages.set('world', key, c.json(value)); return null;
    });
    const before = await c.snapshot(), error = await c.advance().catch(String);
    const node = (await c.readCanonical(pages => pages.get('world', 'dungeon/1/quality/node/24'))).value;
    return { before, after: await c.snapshot(), error, node };
  });
  expect(result.error).toContain('reciprocal adjacent endpoints'); expect(result.after).toEqual(result.before);
  expect(result.node).toBeUndefined();
});
