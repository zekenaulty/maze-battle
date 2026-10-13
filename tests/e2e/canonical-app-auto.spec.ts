import { test, expect, type Page } from '@playwright/test';

const head = (page: Page) => page.evaluate(async () => {
  const { readCanonicalHead } = await import('/src/persistence/canonical/read.ts');
  return (await readCanonicalHead()).head;
});
async function ready(page: Page) {
  await expect(page.getByRole('heading', { name: 'Maze Battle', exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Auto', exact: true })).toBeEnabled();
}
async function moving(page: Page) {
  const before = await head(page);
  await page.getByRole('button', { name: 'Auto', exact: true }).click();
  await expect.poll(async () => (await head(page)).checkpoint.position, { timeout: 20_000 }).not.toEqual(before.checkpoint.position);
}
async function stable(page: Page) {
  const before = await head(page);
  await page.waitForTimeout(1200);
  expect((await head(page)).revision).toBe(before.revision);
}

test('actual App Auto yields to manual movement, dialogs and explicit Stop', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await ready(page); await moving(page);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await head(page)).checkpoint.mode).toBe('manual');
  await page.waitForTimeout(300); await stable(page);
  await moving(page);
  await page.getByRole('button', { name: 'Party', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(400); await stable(page);
  await page.getByRole('button', { name: 'Close dialog' }).click(); await stable(page);
  await page.getByRole('button', { name: 'Stop Auto', exact: true }).click(); await ready(page);
  await moving(page);
  await page.getByRole('button', { name: 'Stop Auto', exact: true }).click(); await ready(page); await stable(page);
  expect(errors).toEqual([]);
});

test('actual App reload retains Auto work but never resumes movement without a fresh toggle', async ({ page }) => {
  await page.goto('/'); await ready(page); await moving(page);
  const original = await head(page);
  await page.reload(); await ready(page); await stable(page);
  expect((await head(page)).gameId).toBe(original.gameId);
  expect((await head(page)).checkpoint.mode).toBe('manual');
  const work = await page.evaluate(async () => {
    const { readCanonical } = await import('/src/persistence/canonical/read.ts');
    const { loadAutoState } = await import('/src/persistence/canonical/auto/records.ts');
    return (await readCanonical(loadAutoState)).value;
  });
  expect(work).not.toBeNull();
  await moving(page);
  await page.getByRole('button', { name: 'Stop Auto', exact: true }).click();
});

test('actual App town Auto services the real party and returns through the shared portal position', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await ready(page);
  await page.keyboard.press('t');
  await expect(page.getByRole('heading', { name: 'Town', exact: true })).toBeVisible();
  const town = await head(page);
  await page.getByRole('button', { name: 'Auto', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Maze Battle', exact: true })).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await head(page)).checkpoint.position, { timeout: 20_000 }).not.toEqual(town.checkpoint.position);
  await page.getByRole('button', { name: 'Stop Auto', exact: true }).click(); await ready(page); await stable(page);
  expect((await head(page)).gameId).toBe(town.gameId);
  expect(errors).toEqual([]);
});

test('actual App keeps Stop usable between floor batches and resumes after reload', async ({ page }) => {
  await page.goto('/'); await ready(page);
  await page.evaluate(async () => {
    const { executeCanonical } = await import('../../src/persistence/canonical/transaction.ts');
    const { readCanonicalHead } = await import('../../src/persistence/canonical/read.ts');
    const { gameRequest } = await import('../../src/services/game/canonicalRequests.ts');
    const { loadFloor } = await import('../../src/persistence/canonical/world/records.ts');
    const { gameCheckpoint, checkpointJson } = await import('../../src/persistence/canonical/game/checkpoint.ts');
    const { initialAutoState, saveAutoState } = await import('../../src/persistence/canonical/auto/records.ts');
    const { recordGameObservation } = await import('../../src/persistence/canonical/knowledge/write.ts');
    const before = (await readCanonicalHead()).head;
    // A completed-floor fixture tests the real App transition, not quest completion or exploration.
    await executeCanonical(gameRequest(before, 'fixture.completed-floor', {}), async tx => {
      const old = gameCheckpoint(tx.head.checkpoint), floor = await loadFloor(tx.pages, 1);
      const offers = await tx.pages.scan('world', 'contracts/1/', undefined, 16);
      if (offers.next) throw Error('Fixture has too many offers');
      for (const offer of offers.rows) await tx.pages.delete('world', offer.key);
      const c = await recordGameObservation(tx, { ...old, position: { level: 1, cell: floor.exit! } });
      tx.setCheckpoint(checkpointJson(c));
      const state = initialAutoState(c, tx.head.revision + 1);
      state.completed = true; state.descent = c.position;
      state.objective = { kind: 'exit', id: 'exit:1', roomId: c.position.cell.spaceId };
      await saveAutoState(tx.pages, state); return {};
    });
  });
  await page.reload(); await ready(page);
  await page.getByRole('button', { name: 'Auto', exact: true }).click();
  const phase = () => page.evaluate(async () => {
    const { readCanonical } = await import('../../src/persistence/canonical/read.ts');
    const { findPreparation } = await import('../../src/persistence/canonical/game/preparation.ts');
    return (await readCanonical(p => findPreparation(p, 2))).value;
  });
  await expect.poll(phase).not.toBeNull();
  await page.getByRole('button', { name: 'Stop Auto', exact: true }).click(); await ready(page); await stable(page);
  expect((await head(page)).checkpoint.position).toMatchObject({ level: 1 });
  const paused = await phase();
  await page.reload(); await ready(page); await stable(page); expect(await phase()).toBe(paused);
  await page.getByRole('button', { name: 'Auto', exact: true }).click();
  await expect.poll(async () => (await head(page)).checkpoint.position, { timeout: 30_000 }).toMatchObject({ level: 2 });
  // The controller must not pause itself merely because its own stairs changed floors.
  const arrival = await head(page);
  await expect.poll(async () => (await head(page)).revision).toBeGreaterThan(arrival.revision + 1);
  await page.getByRole('button', { name: 'Stop Auto', exact: true }).click(); await ready(page); await stable(page);
});

test('taking control while Auto runs fences the old scheduler and does not start a new one', async ({ page, context }) => {
  await page.goto('/'); await ready(page); await moving(page);
  const other = await context.newPage(); await other.goto('/');
  await other.getByRole('button', { name: 'Take control', exact: true }).click(); await ready(other);
  await expect(page.getByRole('button', { name: 'Take control', exact: true })).toBeVisible();
  await stable(other);
  expect((await head(other)).checkpoint.mode).toBe('manual');
  await other.close();
});

test('mobile Auto controls and status fit without covering the canvas', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await ready(page); await moving(page);
  await expect(page.locator('canvas')).not.toHaveAttribute('aria-busy', 'true');
  const layout = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Explore actions"]')!, canvas = document.querySelector('canvas')!;
    const buttons = [...nav.querySelectorAll('button')];
    return { overflow: document.documentElement.scrollWidth > innerWidth,
      clipped: buttons.some(b => b.scrollWidth > b.clientWidth),
      canvasTop: canvas.getBoundingClientRect().top, statusBottom: document.querySelector('.screen-auto-status')!.getBoundingClientRect().bottom };
  });
  expect(layout.overflow).toBe(false); expect(layout.clipped).toBe(false);
  expect(layout.canvasTop).toBeGreaterThanOrEqual(layout.statusBottom);
  await page.screenshot({ path: info.outputPath('mobile-auto.png') });
  await page.getByRole('button', { name: 'Stop Auto', exact: true }).click(); await ready(page); await stable(page);
});
