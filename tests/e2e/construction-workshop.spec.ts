import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('complete empty/library plans render with stable framing, bounded resources and no canonical save effects', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?view=construction');
  const canvas = page.getByLabel('Construction assembly workshop');
  await expect(canvas).toHaveAttribute('data-ready', 'ready', { timeout: 60_000 });
  const ids = await canvas.getAttribute('data-member-ids');
  expect(Number(await canvas.getAttribute('data-furnishings'))).toBe(0);
  await page.screenshot({ path: info.outputPath('empty-framed-room.png') });
  await page.getByLabel('Room program').selectOption('library');
  await expect(canvas).toHaveAttribute('data-ready', 'ready');
  expect(Number(await canvas.getAttribute('data-furnishings'))).toBeGreaterThan(0);
  expect(await canvas.getAttribute('data-member-ids')).toBe(ids);
  await page.getByRole('button', { name: 'Eye level' }).click();
  await page.screenshot({ path: info.outputPath('library-eye-level.png') });
  await page.getByRole('button', { name: 'Overhead' }).click();
  await page.getByLabel('Show support bearings').check();
  await page.screenshot({ path: info.outputPath('library-bearing-plan.png') });
  const warmed = Number(await canvas.getAttribute('data-geometries'));
  for (let i = 0; i < 4; i++) {
    await page.getByLabel('Room program').selectOption('empty'); await expect(canvas).toHaveAttribute('data-furnishings', '0');
    await page.getByLabel('Room program').selectOption('library'); await expect(canvas).toHaveAttribute('data-ready', 'ready');
  }
  await expect.poll(async () => Number(await canvas.getAttribute('data-geometries'))).toBeLessThanOrEqual(warmed);
  await page.getByLabel('Assembly width').selectOption('5');
  await expect(canvas).toHaveAttribute('data-ready', 'ready');
  expect(Number(await canvas.getAttribute('data-members'))).toBeGreaterThan(20);
  await page.getByRole('button', { name: 'Orbit view' }).click();
  await page.screenshot({ path: info.outputPath('wide-library.png') });
  expect((await page.evaluate(() => indexedDB.databases())).some(db => db.name === 'maze-battle')).toBe(false);
  expect(errors).toEqual([]);
});

test('selected shelving meshes fit the planned storage bays and full plan geometry matches its declared envelope', async ({ page }, info) => {
  await page.goto('/?view=construction');
  await expect(page.getByLabel('Construction assembly workshop')).toHaveAttribute('data-ready', 'ready', { timeout: 60_000 });
  const result = await page.evaluate(async () => {
    const { planRoomConstruction } = await import('/src/domain/construction/roomPlan.ts');
    const { ConstructionResources, ConstructionVisual, constructionBounds } = await import('/src/components/maze3d/constructionVisual.ts');
    const resources = await ConstructionResources.load(new AbortController().signal);
    const plan = planRoomConstruction({ id: 'fit', seed: 73, rows: 5, columns: 3, purpose: 'library' });
    const visual = new ConstructionVisual(plan, resources); await resources.ready();
    const result = { declared: plan.bounds, actual: constructionBounds(visual.root),
      shelfRevision: resources.shelvingPack.revision, timberRevision: resources.timberPack.revision,
      furnishings: plan.furnishings.map(f => ({ id: f.id, declared: f.bounds, actual: constructionBounds(visual.root.getObjectByName(f.id)!) })) };
    visual.dispose(); resources.dispose(); return result;
  });
  for (const row of [result, ...result.furnishings]) for (const side of ['min', 'max'] as const)
    row.actual[side].forEach((v, i) => expect(v).toBeCloseTo(row.declared[side][i], 5));
  await writeFile(info.outputPath('construction-fit.json'), JSON.stringify(result, null, 2));
});

test('missing construction packages produce a clear failure without creating a game save', async ({ page }) => {
  await page.route('**/model-packs/timber/manifest.json', route => route.fulfill({ status: 404, body: '' }));
  await page.goto('/?view=construction');
  await expect(page.getByRole('alert')).toContainText('Selected construction package unavailable');
  expect((await page.evaluate(() => indexedDB.databases())).some(db => db.name === 'maze-battle')).toBe(false);
});
