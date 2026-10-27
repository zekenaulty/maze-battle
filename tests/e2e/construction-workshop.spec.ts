import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

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
  await expect(page.getByRole('button', { name: 'Download GLB' })).toBeDisabled();
  expect((await page.evaluate(() => indexedDB.databases())).some(db => db.name === 'maze-battle')).toBe(false);
});

for (const kind of ['room', 'wide-room', 'stairwell', 'cabinet', 'building', 'street']) test(`${kind}: complete textured static GLB is deterministic, embedded and reimports through the standard loader`, async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?view=construction');
  const canvas = page.getByLabel('Construction assembly workshop');
  await expect(canvas).toHaveAttribute('data-ready', 'ready', { timeout: 60_000 });
  await page.getByLabel('Construction assembly', { exact: true }).selectOption(kind === 'wide-room' ? 'room' : kind);
  if (['room', 'wide-room', 'building', 'street'].includes(kind)) await page.getByLabel('Room program').selectOption('library');
  if (kind === 'wide-room') await page.getByLabel('Assembly width').selectOption('5');
  await expect(canvas).toHaveAttribute('data-ready', 'ready');
  if (kind === 'stairwell') await page.getByRole('button', { name: 'Eye level' }).click();
  await page.screenshot({ path: info.outputPath(kind + '-procedural.png') });
  await canvas.screenshot({ path: info.outputPath(kind + '-procedural-canvas.png') });
  const download = async (name: string) => {
    const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download GLB' }).click();
    const result = await pending, target = info.outputPath(name); await result.saveAs(target); return readFile(target);
  };
  const first = await download(kind + '.glb'), second = await download(kind + '-repeat.glb');
  expect(first.equals(second)).toBe(true);
  expect(first.readUInt32LE(0)).toBe(0x46546c67); expect(first.readUInt32LE(4)).toBe(2);
  expect(first.readUInt32LE(8)).toBe(first.length); expect(first.readUInt32LE(16)).toBe(0x4e4f534a);
  const doc = JSON.parse(first.subarray(20, 20 + first.readUInt32LE(12)).toString('utf8'));
  expect(doc.asset.version).toBe('2.0');
  expect(doc.buffers.every((b: any) => !b.uri)).toBe(true);
  expect(doc.images.length).toBeGreaterThan(0); expect(doc.images.every((i: any) => i.bufferView !== undefined && !i.uri)).toBe(true);
  expect(JSON.stringify(doc)).not.toMatch(/localhost|127\.0\.0\.1|C:\\\\/);
  const metadata = doc.nodes.find((n: any) => n.extras?.portable)?.extras.portable;
  expect(metadata?.cacheKey).toMatch(/^[0-9a-f]{64}$/);
  expect(metadata.textureSources.every((p: any) => /^[0-9a-f]{64}$/.test(p.source.sha256))).toBe(true);
  if (kind !== 'cabinet') expect(doc.nodes.some((n: any) => n.extras?.role === 'ceiling')).toBe(true);
  if (kind === 'cabinet') expect(metadata.state).toBe('closed');
  const digest = createHash('sha256').update(first).digest('hex');
  await page.getByRole('button', { name: 'Preview GLB' }).click();
  await expect(canvas).toHaveAttribute('data-reimported', 'true', { timeout: 60_000 });
  await expect(canvas).toHaveAttribute('data-export-sha256', digest);
  await page.screenshot({ path: info.outputPath(kind + '-reimported.png') });
  await canvas.screenshot({ path: info.outputPath(kind + '-reimported-canvas.png') });
  await writeFile(info.outputPath(kind + '-portable.json'), JSON.stringify({ kind, bytes: first.length, sha256: digest,
    bounds: metadata.bounds, cacheKey: metadata.cacheKey, meshes: doc.meshes.length, materials: doc.materials.length,
    images: doc.images.length, sourceRevisions: metadata.sourceRevisions, textureSources: metadata.textureSources }, null, 2));
  expect(errors).toEqual([]);
});

test('building interior, exterior and street share measured envelopes, shaft clearances and source frames', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?view=construction');
  const canvas = page.getByLabel('Construction assembly workshop');
  await expect(canvas).toHaveAttribute('data-ready', 'ready', { timeout: 60_000 });
  await page.getByLabel('Construction assembly', { exact: true }).selectOption('building');
  await page.getByLabel('Room program').selectOption('library');
  await expect(canvas).toHaveAttribute('data-ready', 'ready');
  await page.getByLabel('Inspect lower storey').check();
  await page.getByRole('button', { name: 'Overhead' }).click();
  await page.screenshot({ path: info.outputPath('building-lower-plan.png') });
  await page.getByRole('button', { name: 'Eye level' }).click();
  await page.screenshot({ path: info.outputPath('building-lower-eye.png') });
  await page.getByLabel('Inspect lower storey').uncheck();
  await page.getByLabel('Cutaway roof and front wall').uncheck();
  await page.getByRole('button', { name: 'Orbit view' }).click();
  await page.screenshot({ path: info.outputPath('building-exterior.png') });
  await page.getByLabel('Construction assembly', { exact: true }).selectOption('street');
  await expect(canvas).toHaveAttribute('data-ready', 'ready');
  await page.getByRole('button', { name: 'Eye level' }).click();
  await page.screenshot({ path: info.outputPath('street-eye.png') });
  await page.getByRole('button', { name: 'Orbit view' }).click();
  await page.screenshot({ path: info.outputPath('street-exterior.png') });
  const result = await page.evaluate(async () => {
    const { planAuthoringBuilding } = await import('/src/components/maze3d/buildingAuthoring.ts');
    const { composeBuildingPair } = await import('/src/domain/construction/buildingPlan.ts');
    const { ConstructionResources, ConstructionVisual, constructionBounds } = await import('/src/components/maze3d/constructionVisual.ts');
    const { BuildingCompositionVisual } = await import('/src/components/maze3d/buildingVisual.ts');
    const resources = await ConstructionResources.load(new AbortController().signal);
    const plan = planAuthoringBuilding({ id: 'fit-building', seed: 42, purpose: 'library', storeys: 2 });
    const pair = composeBuildingPair(plan, planAuthoringBuilding({ id: 'fit-neighbor', seed: 73, purpose: 'empty', storeys: 2 }));
    const building = new ConstructionVisual(plan, resources), street = new BuildingCompositionVisual(pair, resources); await resources.ready();
    const result = { building: { declared: plan.bounds, actual: constructionBounds(building.root) },
      street: { declared: pair.bounds, actual: constructionBounds(street.root) }, dependencies: plan.dependencies,
      doors: plan.anchors.filter(a => a.kind === 'door'), windows: plan.anchors.filter(a => a.kind === 'window'),
      instances: pair.buildings.map(b => ({ id: b.id, realmId: b.realmId, translation: b.translation })),
      furnishings: plan.furnishings.map(f => ({ declared: f.bounds, actual: constructionBounds(building.root.getObjectByName(f.id)!) })) };
    building.dispose(); street.dispose(); resources.dispose(); return result;
  });
  for (const row of [result.building, result.street, ...result.furnishings]) for (const side of ['min', 'max'] as const)
    row.actual[side].forEach((n, i) => expect(n).toBeCloseTo(row.declared[side][i], 5));
  await writeFile(info.outputPath('building-fit.json'), JSON.stringify(result, null, 2));
  expect((await page.evaluate(() => indexedDB.databases())).some(db => db.name === 'maze-battle')).toBe(false);
  expect(errors).toEqual([]);
});

test('portable cache binds resolved transforms and refuses an unqualified animated material', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?view=construction');
  await expect(page.getByLabel('Construction assembly workshop')).toHaveAttribute('data-ready', 'ready', { timeout: 60_000 });
  const result = await page.evaluate(async () => {
    const { planRoomConstruction } = await import('/src/domain/construction/roomPlan.ts');
    const { ConstructionResources, ConstructionVisual } = await import('/src/components/maze3d/constructionVisual.ts');
    const { bakePortableConstruction } = await import('/src/components/maze3d/portableConstruction.ts');
    const resources = await ConstructionResources.load(new AbortController().signal);
    const visual = new ConstructionVisual(planRoomConstruction({ id: 'cache', seed: 1, rows: 3, columns: 3, purpose: 'empty' }), resources);
    const first = await bakePortableConstruction(visual.root, resources);
    visual.root.position.x = 1.234;
    const moved = await bakePortableConstruction(visual.root, resources);
    visual.root.children[0].userData.proofIdentity = 'changed-part';
    const metadataChanged = await bakePortableConstruction(visual.root, resources);
    for (const material of Object.values(resources.timberPack.materials)) material.animation = { loop: true, interpolate: false, frames: [], timeline: [] };
    let rejected = ''; try { await bakePortableConstruction(visual.root, resources); } catch (e) { rejected = String(e); }
    visual.dispose(); resources.dispose(); return { first: first.cacheKey, moved: moved.cacheKey, metadataChanged: metadataChanged.cacheKey, rejected };
  });
  expect(result.first).not.toBe(result.moved);
  expect(result.moved).not.toBe(result.metadataChanged);
  expect(result.rejected).toContain('Animated materials require an explicit static-frame policy');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(errors).toEqual([]);
});
