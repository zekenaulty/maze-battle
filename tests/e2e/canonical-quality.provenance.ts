import { test, expect } from '@playwright/test';
import type {} from './canonical-quality-fixture';

test('non-cursor node 2 cannot falsify the two-arm chain proof', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalQuality; await c.seedTwoArm(); await c.begin();
    for (let i = 0; i < 3; i++) await c.advance();
    const cursor = (await c.state()).value;
    await c.executeCanonical(await c.request('fixture.forge-reduction'), async ({ pages }) => {
      const key = 'dungeon/1/quality/node/2', row = await pages.get('world', key);
      const node = row!.value as unknown as { arm: number; metrics: { forks: number; longestChain: number } };
      node.arm = 1; node.metrics.forks = 2; node.metrics.longestChain = 0;
      await pages.set('world', key, c.json(node)); return null;
    });
    return { cursor, ...await c.rejections() };
  });
  expect(result.cursor.nextRoom).toBe(0);
  for (const failure of result.failures) {
    expect(failure.error).toContain('quality node namespace'); expect(failure.after).toEqual(result.before);
  }
});

for (const phase of ['running', 'qualified']) for (const kind of ['connection', 'passage']) {
  test(`deleted processed remote ${kind} rejects ${phase} proof`, async ({ page }) => {
    const result = await page.evaluate(async ({ phase, kind }) => {
      const c = window.canonicalQuality; await c.seedWorld(781, 25, 'passage'); await c.begin();
      for (let i = 0; i < 6; i++) await c.advance();
      if (phase === 'qualified') await c.advance();
      await c.executeCanonical(await c.request('fixture.delete-processed'), async ({ pages }) => {
        const join = (await pages.get('world', 'dungeon/1/join/socket-23'))!.value as unknown as { join: { fromRoomId: string } };
        if (join.join.fromRoomId === 'entry') throw Error('Fixture needs a remote join');
        await pages.delete('world', `dungeon/1/${kind === 'connection' ? 'connection/socket-23:exit' : 'space/socket-23:passage'}`);
        return null;
      });
      return c.rejections();
    }, { phase, kind });
    for (const failure of result.failures) {
      expect(failure.error).toContain('quality binding'); expect(failure.after).toEqual(result.before);
    }
  });
}

for (const status of ['running', 'failed', 'qualified']) test(`missing both controls cannot restart ${status} scratch`, async ({ page }) => {
  const result = await page.evaluate(async status => {
    const c = window.canonicalQuality;
    if (status === 'failed') await c.seedChain(); else await c.seedWorld(781, 8);
    if (status === 'running') { await c.begin(); await c.advance(); } else await c.finishQuality();
    const state = (await c.state()).value;
    await c.executeCanonical(await c.request('fixture.delete-controls'), async ({ pages }) => {
      await pages.delete('world', 'dungeon/1/quality'); await pages.delete('world', 'dungeon/1/quality/progress'); return null;
    });
    return { state, ...await c.rejections() };
  }, status);
  expect(result.state.status).toBe(status);
  expect(result.failures.find(f => f.operation === 'begin')!.error).toContain('surviving nodes');
  for (const failure of result.failures) { expect(failure.error).not.toBeNull(); expect(failure.after).toEqual(result.before); }
});

test('original receipt still replays exactly after provenance changes but cannot admit current content', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalQuality; await c.seedWorld(781, 8); await c.begin(); await c.advance();
    const original = await c.request('fixture.final'), applied = await c.advance(original);
    await c.executeCanonical(await c.request('fixture.reversion'), async ({ pages }) => {
      const key = 'dungeon/1/quality/node/2', row = await pages.get('world', key);
      await pages.set('world', key, row!.value); return null;
    });
    const before = await c.snapshot(), replay = await c.executeCanonical(original, async () => { throw Error('Must replay'); });
    const error = await c.readCanonical(pages => c.quality.requireWorldFloorQuality(pages, 1)).catch(String);
    return { applied: applied.receipt, replay, error, before, after: await c.snapshot() };
  });
  expect(result.replay.replayed).toBe(true); expect(result.replay.receipt).toEqual(result.applied);
  expect(result.error).toContain('quality node namespace'); expect(result.after).toEqual(result.before);
});
