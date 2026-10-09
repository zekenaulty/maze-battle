import { expect, test } from '@playwright/test';

test('streamed UI prepares, explores, reloads, collects every chest and returns without altering earlier saves', async ({ page }, info) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?expedition=2');
  const screen = page.locator('.stream-screen');
  await expect(screen).toBeVisible();
  const originals = await page.evaluate(async () => {
    const { createNewGameState } = await import('/src/domain/gameFactory.ts');
    const { saveGame } = await import('/src/persistence/saveRepository.ts');
    const { createExpeditionPlan, materializeSpace } = await import('/src/domain/expedition/generation.ts');
    const { createExpeditionCheckpoint } = await import('/src/domain/expedition/commands.ts');
    const legacy = await import('/src/persistence/expeditionRepository.ts');
    const plan = createExpeditionPlan({ version: 'spaces-v1', worldId: 'preserve', floorId: 'one', seed: 1, level: 1 });
    await legacy.saveExpedition('structural-demo', plan, createExpeditionCheckpoint(plan, materializeSpace), null);
    return { ordinary: JSON.stringify(await saveGame('auto', 'Preserve', 'auto', createNewGameState({ id: 'ordinary-stream-sentinel' }))),
      legacy: JSON.stringify(await legacy.loadExpedition('structural-demo')) };
  });
  const before = await page.evaluate(async () => (await import('/src/persistence/streamRepository.ts')).loadStreamSnapshot('streamed-demo'));
  await page.getByRole('button', { name: 'Prepare doorway', exact: true }).click();
  await expect(screen).toHaveAttribute('data-topology-revision', '1');
  await expect(screen).toHaveAttribute('data-moves', '0');
  const prepared = await page.evaluate(async () => (await import('/src/persistence/streamRepository.ts')).loadStreamSnapshot('streamed-demo'));
  expect(prepared.checkpoint.position).toEqual(before.checkpoint.position);
  expect(prepared.checkpoint.visitedSpaces).toBe(1);
  await page.getByRole('slider', { name: 'Exploration pace' }).fill('20');
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await expect.poll(async () => Number(await screen.getAttribute('data-visited-spaces')), { timeout: 30_000 }).toBeGreaterThan(3);
  await page.getByRole('button', { name: 'Stop Auto' }).click();
  await page.waitForTimeout(200);
  const paused = await screen.getAttribute('data-revision');
  await page.reload();
  await expect(screen).toHaveAttribute('data-revision', paused!);
  await expect(page.getByRole('button', { name: 'Explore', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('slider', { name: 'Exploration pace' }).fill('20');
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await expect(screen).toHaveAttribute('data-phase', 'complete', { timeout: 120_000 });
  const completed = await page.evaluate(async () => {
    const api = await import('/src/persistence/streamRepository.ts');
    const { loadTopologyHeader } = await import('/src/persistence/topologyRepository.ts');
    return { snapshot: await api.loadStreamSnapshot('streamed-demo'), root: await loadTopologyHeader('streamed-demo') };
  });
  const { checkpoint } = completed.snapshot;
  expect(completed.root!.header.seal).toBeDefined();
  expect(checkpoint.position).toEqual(checkpoint.home);
  expect(checkpoint.visitedSpaces).toBe(completed.root!.header.rooms * 2 - 1);
  expect(checkpoint.clearedSpaces).toBe(checkpoint.visitedSpaces);
  expect(checkpoint.collectedChests).toBe(completed.root!.header.rooms - 1);
  expect(Number(await screen.getAttribute('data-resident-cells'))).toBeLessThanOrEqual(512);
  expect(Number(await screen.getAttribute('data-planner-pages'))).toBeLessThanOrEqual(1);
  expect(Number(await screen.getAttribute('data-evictions'))).toBeGreaterThan(0);
  expect(Number(await screen.getAttribute('data-reused-steps'))).toBeGreaterThan(20);
  await page.reload();
  await expect(screen).toHaveAttribute('data-phase', 'complete');
  const preserved = await page.evaluate(async () => ({
    ordinary: JSON.stringify(await (await import('/src/persistence/saveRepository.ts')).getDatabase().then(db => db.get('saves', 'auto'))),
    legacy: JSON.stringify(await (await import('/src/persistence/expeditionRepository.ts')).loadExpedition('structural-demo')),
  }));
  expect(preserved).toEqual(originals);
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('stream-complete.png') });
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 320, height: 640 }, { width: 390, height: 780 }, { width: 844, height: 390 }]) {
  test(`streamed room stays readable at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await page.goto('/?expedition=2');
    await expect(page.getByRole('heading', { name: 'Streamed Expedition' })).toBeVisible();
    const canvas = page.getByRole('img', { name: 'Expedition room' }).or(page.locator('canvas[aria-label="Expedition room"]'));
    await expect(canvas).toBeVisible();
    const bounds = await canvas.boundingBox();
    expect(bounds!.height).toBeGreaterThan(viewport.height * 0.4);
    const toolbar = await page.locator('.expedition-strip').boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(toolbar!.y + toolbar!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect.poll(() => canvas.evaluate((node: HTMLCanvasElement) => {
      const data = node.getContext('2d')!.getImageData(0, 0, node.width, node.height).data;
      const colors = new Set<string>();
      for (let index = 0; index < data.length; index += 160) colors.add(`${data[index]},${data[index + 1]},${data[index + 2]}`);
      return colors.size;
    })).toBeGreaterThan(20);
    await page.screenshot({ path: info.outputPath('stream-room.png') });
  });
}

test('streamed autoplay yields to focused-button keyboard input and fences older tabs', async ({ page, context }) => {
  await page.goto('/?expedition=2');
  await page.getByRole('slider', { name: 'Exploration pace' }).fill('800');
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.keyboard.press('w');
  await expect(page.getByRole('button', { name: 'Explore', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.stream-screen')).toHaveAttribute('data-moves', '1');
  const next = await context.newPage();
  await next.goto('/?expedition=2');
  await expect(next.locator('.stream-screen')).toHaveAttribute('data-revision', '1');
  await page.keyboard.press('w');
  await expect(page.getByRole('button', { name: 'Reload', exact: true })).toBeVisible();
  await next.keyboard.press('w');
  await expect(next.locator('.stream-screen')).toHaveAttribute('data-moves', '2');
});
