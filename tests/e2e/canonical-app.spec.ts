import { test, expect, type Page } from '@playwright/test';

async function ready(page: Page) {
  await expect(page.getByRole('heading', { name: 'Maze Battle', exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByText('Map evidence unavailable')).toHaveCount(0);
}
async function head(page: Page) {
  return page.evaluate(async () => {
    const { readCanonicalHead } = await import('/src/persistence/canonical/read.ts');
    return (await readCanonicalHead()).head;
  });
}
async function pixels(page: Page) {
  return page.locator('canvas').evaluate(canvas => {
    const c = canvas as HTMLCanvasElement, data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const colors = new Set<number>();
    for (let i = 0; i < data.length; i += 16) colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    return colors.size;
  });
}

test('actual App starts canonical, moves, reloads and renders at desktop/mobile sizes', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await ready(page);
  await expect.poll(() => pixels(page)).toBeGreaterThan(20);
  const before = await head(page);
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await head(page)).checkpoint.position).not.toEqual(before.checkpoint.position);
  const moved = await head(page);
  await page.reload(); await ready(page);
  expect((await head(page)).checkpoint.position).toEqual(moved.checkpoint.position);
  for (const [width, height] of [[1440, 900], [390, 844], [820, 1180]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.locator('canvas')).not.toHaveAttribute('aria-busy', 'true');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect.poll(() => pixels(page)).toBeGreaterThan(20);
    const bounds = await page.locator('canvas').boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0); expect(bounds!.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`app-${width}.png`) });
  }
  expect(errors).toEqual([]);
});

test('portal, guild, inventory and named checkpoint use the same real save', async ({ page }) => {
  await page.goto('/'); await ready(page);
  const before = await head(page);
  await page.getByRole('button', { name: 'Saves', exact: true }).click();
  await page.getByRole('button', { name: 'New save', exact: true }).click();
  await expect(page.getByRole('button', { name: /load/i }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.keyboard.press('t');
  await expect(page.getByRole('heading', { name: 'Town', exact: true })).toBeVisible();
  expect((await head(page)).gameId).toBe(before.gameId);
  await page.getByRole('button', { name: 'Party', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Dungeon', exact: true }).click();
  await ready(page);
  await expect(page.getByRole('button', { name: 'Portal (0)' })).toBeDisabled();
  await page.getByRole('button', { name: 'Saves', exact: true }).click();
  await page.getByRole('button', { name: /load/i }).first().click();
  await page.getByRole('button', { name: 'Load save', exact: true }).click();
  await ready(page);
  await expect(page.getByRole('button', { name: 'Portal (1)' })).toBeEnabled();
  expect((await head(page)).checkpoint.position).toEqual(before.checkpoint.position);
});

test('invalid persisted observation fails closed with working explicit reset', async ({ page }) => {
  await page.goto('/'); await ready(page); const before = await head(page);
  await page.evaluate(async () => {
    const { openCanonicalDatabase } = await import('/src/persistence/canonical/database.ts');
    const db = await openCanonicalDatabase(), schema = await db.get('meta', 'schema');
    const row = await db.get('heads', schema!.gameId!);
    (row!.checkpoint.knowledge as { id: string }).id = 'missing-observation';
    await db.put('heads', row!, row!.gameId); db.close();
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Reset and start new game' })).toBeEnabled();
  await page.getByRole('button', { name: 'Reset and start new game' }).click();
  await page.getByRole('button', { name: 'Discard saves and start new game' }).click();
  await ready(page); expect((await head(page)).generation).not.toBe(before.generation);
});

test('all former preview query routes use the same game and no Agentica network', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (/5085|\/api\/host/.test(request.url())) requests.push(request.url()); });
  await page.goto('/'); await ready(page); const original = await head(page);
  for (const query of ['?agentica=1', '?expedition=1', '?expedition=2', '?expedition=3']) {
    await page.goto(`/${query}`); await ready(page); expect((await head(page)).gameId).toBe(original.gameId);
  }
  await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Agentica recovery' })).toBeVisible();
  await expect(page.getByText('No local recovery entries found.')).toBeVisible();
  expect(requests).toEqual([]);
});

test('second tab is read only until explicit takeover; old tab cannot move', async ({ page, context }) => {
  await page.goto('/'); await ready(page);
  const other = await context.newPage(); await other.goto('/'); await ready(other);
  await expect(other.getByRole('button', { name: 'Take control', exact: true })).toBeVisible();
  const before = await head(page);
  await other.keyboard.press('ArrowRight');
  expect((await head(other)).checkpoint.position).toEqual(before.checkpoint.position);
  await other.getByRole('button', { name: 'Take control', exact: true }).click(); await ready(other);
  await expect(page.getByRole('button', { name: 'Take control', exact: true })).toBeVisible();
  const owned = await head(other); expect(owned.owner).not.toBe(before.owner);
  await page.keyboard.press('ArrowRight'); expect((await head(other)).checkpoint.position).toEqual(owned.checkpoint.position);
  await other.keyboard.press('ArrowRight');
  await expect.poll(async () => (await head(other)).checkpoint.position).not.toEqual(owned.checkpoint.position);
  await other.close();
});

test('old malformed save is discarded at schema cutover, never normalized', async ({ page }) => {
  await page.route('**/empty-start', route => route.fulfill({ contentType: 'text/html', body: '<title>Storage setup</title>' }));
  await page.goto('/empty-start');
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('maze-battle', 7);
    request.onupgradeneeded = () => request.result.createObjectStore('saves');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('saves', 'readwrite');
      tx.objectStore('saves').put({ invalid: 'observation history', game: { maze: null, floors: [null] } }, 'auto');
      tx.oncomplete = () => { db.close(); resolve(); };
    };
  }));
  await page.goto('/'); await ready(page);
  const storage = await page.evaluate(async () => {
    const { openCanonicalDatabase } = await import('/src/persistence/canonical/database.ts');
    const db = await openCanonicalDatabase();
    const result = { version: db.version, stores: Array.from(db.objectStoreNames) }; db.close(); return result;
  });
  expect(storage.version).toBe(9);
  expect(storage.stores).toEqual(['heads', 'meta', 'nodes', 'operations', 'receipts', 'records']);
  expect((await head(page)).checkpoint.knowledge).not.toBeNull();
});
