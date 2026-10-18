import { test, expect, type Page } from '@playwright/test';
import type { CanonicalHead, CanonicalRecord } from '../../src/persistence/canonical/types';

async function storage(page: Page) {
  return page.evaluate(async () => {
    // @ts-expect-error Native Vite URL, reusing the isolated actual-App fixture.
    const fixture = await import('/tests/e2e/app-recovery.fixture.ts') as typeof import('./app-recovery.fixture');
    await window.__appRecoverySession.flush();
    return Object.fromEntries(JSON.parse(await fixture.dump())) as { heads: CanonicalHead[]; records: CanonicalRecord[] };
  });
}
async function spatial(page: Page, remove = false) {
  return page.evaluate(async remove => {
    // @ts-expect-error Native Vite module URL.
    const { readCanonical } = await import('/src/persistence/canonical/read.ts') as typeof import('../../src/persistence/canonical/read');
    // @ts-expect-error Native Vite module URL.
    const { worldBlockKey, loadWorldIndexBlock } = await import('/src/persistence/canonical/knowledge/worldIndex.ts') as typeof import('../../src/persistence/canonical/knowledge/worldIndex');
    // @ts-expect-error Native Vite module URL.
    const { worldIndexEvidenceKey } = await import('/src/persistence/canonical/knowledge/worldIndex.evidence.ts') as typeof import('../../src/persistence/canonical/knowledge/worldIndex.evidence');
    // @ts-expect-error Native Vite module URL.
    const { openCanonicalDatabase } = await import('/src/persistence/canonical/database.ts') as typeof import('../../src/persistence/canonical/database');
    const game = window.__appRecoverySession.view.game!, actor = game.observation!.cells.find(c => JSON.stringify(c.at) === JSON.stringify(game.checkpoint.position))!;
    const key = worldBlockKey(actor.at.level, actor.world);
    const { head, value } = await readCanonical(async pages => {
      await loadWorldIndexBlock(pages, actor.at.level, actor.world);
      return { block: (await pages.get('knowledge', key))!, proof: (await pages.get('knowledge', worldIndexEvidenceKey(key)))! };
    });
    if (!value.block || !value.proof) throw Error('Fresh current game must contain both spatial records');
    const db = await openCanonicalDatabase();
    try {
      if (remove) await db.delete('records', [head.gameId, value.proof.id]);
      return { head, ...value, database: db.name, version: db.version };
    } finally { db.close(); }
  }, remove);
}
async function rendered(page: Page) {
  await expect(page.getByRole('heading', { name: 'Maze Battle', exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('canvas')).not.toHaveAttribute('aria-busy', 'true');
  await expect.poll(() => page.locator('canvas').evaluate(canvas => {
    const c = canvas as HTMLCanvasElement, pixels = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const colors = new Set<number>();
    for (let i = 0; i < pixels.length; i += 16) colors.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2]);
    return colors.size;
  })).toBeGreaterThan(20);
  await expect(page.getByText('Map evidence unavailable', { exact: true })).toHaveCount(0);
}

for (const funded of [false, true]) test(`missing spatial proof reload ${funded ? 'preserves funded obligations and refuses reset' : 'requires confirmed reset and renders fresh evidence'}`, async ({ page }, info) => {
  const external: string[] = [], sockets: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('websocket', socket => { if (!socket.url().startsWith('ws://127.0.0.1:5288/')) sockets.push(socket.url()); });
  await page.route('**/*', route => {
    if (route.request().url().startsWith('http://127.0.0.1:5288/')) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  await page.goto('/'); await rendered(page);
  if (funded) await page.evaluate(async () => {
    // @ts-expect-error Existing provider-free local admission through the hook-owned session.
    await (await import('/tests/e2e/app-recovery.fixture.ts')).seedNavigation();
  });
  const original = await storage(page), seed = await spatial(page, true), damaged = await storage(page);
  expect(damaged).toEqual({ ...original, records: original.records.filter(row => row.id !== seed.proof.id) });
  expect(seed.head.quota.reservations).toBe(funded ? 2 : 0);
  await page.reload(); await expect(page.getByRole('alert')).toHaveText('Map evidence unavailable');
  const reloaded = await storage(page), head = reloaded.heads[0];
  for (const key of ['gameId', 'generation', 'checkpoint', 'roots', 'allocations'] as const) expect(head[key]).toEqual(seed.head[key]);
  for (const key of ['reservations', 'reservedBytes'] as const) expect(head.quota[key]).toBe(seed.head.quota[key]);
  expect(reloaded.records).toEqual(damaged.records);
  await page.getByRole('button', { name: 'Expedition settings', exact: true }).click();
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Start a new game?', exact: true });
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await storage(page)).toEqual(reloaded);
  await page.getByRole('button', { name: 'Expedition settings', exact: true }).click();
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  expect(await storage(page)).toEqual(reloaded);
  await confirmation.getByRole('button', { name: 'Start new game', exact: true }).click();
  if (funded) {
    await expect(page.getByRole('region', { name: 'Game recovery' }).getByRole('status')).toContainText('reset blocked by unresolved verified-host obligation');
    expect(await storage(page)).toEqual(reloaded);
    await expect(page.getByRole('button', { name: 'Agentica recovery', exact: true })).toBeEnabled();
  } else {
    await rendered(page); const fresh = await spatial(page);
    expect(fresh.head.gameId).not.toBe(seed.head.gameId); expect(fresh.head.generation).not.toBe(seed.head.generation);
    expect(fresh.version).toBe(seed.version); expect(fresh.proof.id).not.toBe(seed.proof.id);
    expect(fresh.head.allocations).toEqual({}); expect(fresh.head.quota.reservations).toBe(0);
    await page.reload(); await rendered(page); expect((await spatial(page)).proof).toEqual(fresh.proof);
  }
  expect(external).toEqual([]); expect(sockets).toEqual([]); expect(errors).toEqual([]);
  expect((await page.evaluate(() => indexedDB.databases())).find(db => db.name === seed.database)?.version).toBe(seed.version);
  await info.attach('spatial-recovery.json', { body: JSON.stringify({ funded, seed, final: await storage(page) }), contentType: 'application/json' });
});
