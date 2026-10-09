import { expect, test } from '@playwright/test';

test('isolated expedition persists exploration, stops, resumes and completes without changing the RPG save', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?expedition=1');
  const screen = page.locator('.expedition-screen');
  await expect(screen).toBeVisible();
  const ordinary = await page.evaluate(async () => {
    const { createNewGameState } = await import('/src/domain/gameFactory.ts');
    const { saveGame } = await import('/src/persistence/saveRepository.ts');
    return JSON.stringify(await saveGame('auto', 'Ordinary expedition', 'auto', createNewGameState({ id: 'ordinary-save-sentinel' })));
  });
  await page.getByRole('slider', { name: 'Exploration pace' }).fill('20');
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await expect.poll(async () => Number(await screen.getAttribute('data-moves')), { timeout: 30_000 }).toBeGreaterThan(35);
  await page.getByRole('button', { name: 'Stop Auto' }).click();
  await expect(page.getByRole('button', { name: 'Explore', exact: true })).toHaveAttribute('aria-pressed', 'false');
  // A dispatched write may settle after takeover; subsequent commands must not dispatch.
  await page.waitForTimeout(200);
  const pausedRevision = await screen.getAttribute('data-revision');
  const paused = await page.evaluate(async () => (await import('/src/persistence/expeditionRepository.ts')).loadExpedition('structural-demo'));
  expect(paused!.checkpoint.revision).toBe(Number(pausedRevision));
  await page.waitForTimeout(200);
  await expect(screen).toHaveAttribute('data-revision', pausedRevision!);
  await page.reload();
  await expect(screen).toHaveAttribute('data-revision', pausedRevision!);
  await expect(page.getByRole('button', { name: 'Explore', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('slider', { name: 'Exploration pace' }).fill('20');
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await expect(screen).toHaveAttribute('data-phase', 'complete', { timeout: 90_000 });
  await expect(page.getByRole('button', { name: 'Explore', exact: true })).toBeDisabled();
  expect(Number(await screen.getAttribute('data-evictions'))).toBeGreaterThan(0);
  expect(Number(await screen.getAttribute('data-resident-cells'))).toBeLessThanOrEqual(512);
  expect(Number(await screen.getAttribute('data-reused-steps'))).toBeGreaterThan(20);
  expect(Number(await screen.getAttribute('data-map-audits'))).toBe(1);
  const completed = await page.evaluate(async () => (await import('/src/persistence/expeditionRepository.ts')).loadExpedition('structural-demo'));
  const ledger = await page.evaluate(async () => (await import('/src/persistence/expeditionActionRepository.ts')).loadExpeditionSession('structural-demo'));
  expect(ledger!.pendingActionId).toBeNull();
  expect(ledger!.receiptCount).toBe(completed!.checkpoint.revision);
  expect(completed!.checkpoint.position).toEqual(completed!.checkpoint.home);
  expect(completed!.checkpoint.openedChestIds).toHaveLength(completed!.plan.spaces.flatMap(space => space.chests).length);
  expect(new Set(Object.values(completed!.checkpoint.knowledge.cells).map(cell => cell.spaceId)).size).toBe(completed!.plan.spaces.length);
  await page.reload();
  await expect(screen).toHaveAttribute('data-phase', 'complete');
  const after = await page.evaluate(async () => (await import('/src/persistence/saveRepository.ts')).getDatabase().then(db => db.get('saves', 'auto')));
  expect(JSON.stringify(after)).toBe(ordinary);
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('expedition-complete.png') });
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 780 }, { width: 320, height: 640 }, { width: 844, height: 390 }]) {
  test(`expedition room remains visible at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await page.goto('/?expedition=1');
    await expect(page.getByRole('heading', { name: 'Guild Expedition' })).toBeVisible();
    const map = page.locator('canvas[aria-label="Expedition room"]');
    await expect(map).toBeVisible();
    const box = await map.boundingBox();
    expect(box!.height).toBeGreaterThan(viewport.height * 0.4);
    const header = await page.locator('.expedition-strip').boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
    await expect.poll(() => map.evaluate((node: HTMLCanvasElement) => {
      const pixels = node.getContext('2d')!.getImageData(0, 0, node.width, node.height).data;
      const colors = new Set<string>();
      for (let index = 0; index < pixels.length; index += 160) colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`);
      return colors.size;
    })).toBeGreaterThan(20);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Move north' })).toHaveCount(viewport.width <= 600 ? 1 : 0);
    await page.screenshot({ path: info.outputPath('expedition-room.png') });
  });
}

test('manual movement takes control even when the auto button has focus', async ({ page }) => {
  await page.goto('/?expedition=1');
  await page.getByRole('slider', { name: 'Exploration pace' }).fill('800');
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.keyboard.press('w');
  await expect(page.getByRole('button', { name: 'Explore', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.expedition-screen')).toHaveAttribute('data-moves', '1');
});

test('invalid saved geometry reports an error without replacing the checkpoint', async ({ page }) => {
  await page.goto('/?expedition=1');
  await expect(page.locator('.expedition-screen')).toBeVisible();
  const corrupted = await page.evaluate(async () => {
    const repo = await import('/src/persistence/expeditionRepository.ts');
    const { materializeSpace } = await import('/src/domain/expedition/schematic.ts');
    const record = (await repo.loadExpedition('structural-demo'))!;
    const spec = record.plan.spaces.find(space => space.id === record.checkpoint.position.spaceId)!;
    const geometry = materializeSpace(spec);
    for (let row = 0; row < spec.rows; row++) {
      for (let column = 0; column < spec.columns; column++) {
        if (geometry.cells.some(cell => cell.row === row && cell.column === column)) continue;
        record.checkpoint.position = { spaceId: spec.id, row, column };
        record.checkpoint.revision++;
        const { openExpeditionDatabase } = await import('/src/persistence/expeditionDatabase.ts');
        const db = await openExpeditionDatabase();
        await db.put('expeditions', record, 'structural-demo');
        db.close();
        return record;
      }
    }
    throw new Error('Fixture must contain a pillar.');
  });
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('Checkpoint position is not on walkable floor.');
  await expect(page.locator('.expedition-screen')).toHaveCount(0);
  const after = await page.evaluate(async () => (await import('/src/persistence/expeditionRepository.ts')).loadExpedition('structural-demo'));
  expect(after).toEqual(corrupted);
});
