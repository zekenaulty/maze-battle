import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const workshop = (page: Page) => page.getByLabel('Model and stair workshop', { exact: true });
const dungeon = (page: Page) => page.getByLabel('Explorable 3D dungeon', { exact: true });
async function frames(page: Page, n = 5) { await page.evaluate(n => new Promise<void>(resolve => { const tick = () => --n ? requestAnimationFrame(tick) : resolve(); requestAnimationFrame(tick); }), n); }

test('five native shelving variants render at avatar scale, with cabinet hinge poses and warmed GPU resources', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?view=models&exhibit=shelving'); await expect(workshop(page)).toHaveAttribute('data-shelving-ready', 'true');
  await expect(workshop(page)).toHaveAttribute('data-shelving-avatar', 'ready');
  for (const kind of ['low-bookcase', 'library', 'wall-case', 'bracket-shelf', 'cabinet']) {
    await page.getByLabel('Shelving model', { exact: true }).selectOption(kind); await frames(page);
    await page.screenshot({ path: info.outputPath(kind + '-front.png') });
  }
  await page.getByLabel('Open cabinet doors', { exact: true }).check(); await frames(page); await page.screenshot({ path: info.outputPath('cabinet-open.png') });
  const warmed = await workshop(page).evaluate(c => [(c as HTMLCanvasElement).dataset.gpuGeometries, (c as HTMLCanvasElement).dataset.gpuTextures]);
  for (let i = 0; i < 3; i++) {
    await page.getByLabel('Shelving model').selectOption('library'); await frames(page);
    await page.getByLabel('Shelving model').selectOption('cabinet'); await page.getByLabel('Open cabinet doors').setChecked(i % 2 === 0); await frames(page);
    expect(await workshop(page).evaluate(c => [(c as HTMLCanvasElement).dataset.gpuGeometries, (c as HTMLCanvasElement).dataset.gpuTextures])).toEqual(warmed);
  }
  await page.getByLabel('Shelving model').selectOption('library');
  for (const view of ['back', 'left', 'right', 'front']) {
    await page.getByRole('button', { name: view, exact: true }).click(); await frames(page); await page.screenshot({ path: info.outputPath('library-' + view + '.png') });
  }
  expect(await page.evaluate(async () => (await indexedDB.databases()).map(db => db.name))).toEqual([]);
  expect(errors).toEqual([]); await writeFile(info.outputPath('workshop-gpu.json'), JSON.stringify({ warmed, errors }, null, 2));
});

test('actual imported meshes fit every rotated placement and cabinet sweep without a second scale or UV conversion', async ({ page }, info) => {
  await page.goto('/?view=models&exhibit=shelving'); await expect(workshop(page)).toHaveAttribute('data-shelving-ready', 'true');
  const report = await page.evaluate(async () => {
    const THREE = await import('/tests/e2e/shelving.probe.ts');
    const { SHELVING, SHELVING_PACK_URL, placeShelving, shelfYaw } = await import('/src/components/maze3d/shelving.ts');
    const { VisualInstance, VisualResources } = await import('/src/assets3d/models/VisualInstance.ts');
    const pack = await (await fetch(SHELVING_PACK_URL)).json(), placements = await (await fetch('/assets/model-packs/shelving/placement.json')).json();
    const resources = new VisualResources(SHELVING_PACK_URL), measurements = []; let maxOutside = 0, maxBookHeight = 0, books = 0;
    for (const [kind, profile] of Object.entries(SHELVING)) {
      const asset = pack.assets[profile.assetId], instance = new VisualInstance(asset, resources);
      instance.bindMaterials(Object.fromEntries(Object.entries(pack.bindings[asset.id]).map(([slot, id]) => [slot, pack.materials[id as string]])));
      instance.setVisualState(kind === 'cabinet' ? 'closed' : 'default');
      for (const facing of ['north', 'east', 'south', 'west'] as const) {
        const box = placeShelving({ id: 'test', material: 'bookshelf', center: [4, 1.1, -6], size: ['east', 'west'].includes(facing) ? [.34, 2.2, 1.5] : [1.5, 2.2, .34], solid: true, facing }, kind as keyof typeof SHELVING);
        instance.root.position.set(box.center[0], box.center[1] - box.size[1] / 2, box.center[2]); instance.root.rotation.y = shelfYaw[facing]; instance.root.updateMatrixWorld(true);
        const actual = new THREE.Box3().setFromObject(instance.root);
        for (let axis = 0; axis < 3; axis++) maxOutside = Math.max(maxOutside, box.center[axis] - box.size[axis] / 2 - actual.min.getComponent(axis), actual.max.getComponent(axis) - box.center[axis] - box.size[axis] / 2);
        measurements.push({ kind, facing, actual: { min: actual.min.toArray(), max: actual.max.toArray() } });
      }
      instance.root.position.set(0, 0, 0); instance.root.rotation.set(0, 0, 0); instance.root.updateMatrixWorld(true);
      instance.root.traverse(node => { if (!(node instanceof THREE.Mesh) || node.userData.visualPart.mesh.slot !== 'books') return;
        const b = new THREE.Box3().setFromObject(node); maxBookHeight = Math.max(maxBookHeight, b.max.y - b.min.y); books++;
      });
      if (kind === 'cabinet') {
        instance.setVisualState('open'); const actual = new THREE.Box3().setFromObject(instance.root), swept = placements.assets[asset.id].operatingEnvelope;
        for (let i = 0; i < 3; i++) maxOutside = Math.max(maxOutside, swept.min[i] - actual.min.getComponent(i), actual.max.getComponent(i) - swept.max[i]);
      }
      instance.dispose();
    }
    resources.dispose(); return { measurements, maxOutside, maxBookHeight, books };
  });
  await writeFile(info.outputPath('rotated-fit.json'), JSON.stringify(report, null, 2));
  expect(report.maxOutside).toBeLessThan(1e-5); expect(report.books).toBeGreaterThan(30); expect(report.maxBookHeight).toBeLessThan(.5);
});

test('seeded dungeon shelving batches books, preserves resource identity and survives 2D/3D round trips', async ({ page }, info) => {
  await page.goto('/tests/e2e/canonical-stairs.html?view=stage3d'); await expect(dungeon(page)).toHaveAttribute('data-shelving-status', 'ready');
  await expect(dungeon(page)).toHaveAttribute('data-timber-status', 'ready');
  const report = await page.evaluate(async () => {
    const { StageShelving } = await import('/src/components/maze3d/StageShelving.ts');
    const { AssetRegistry } = await import('/src/assets3d/registry.ts'); const { ThreeAssetLibrary } = await import('/src/assets3d/threeAssets.ts');
    const { compileStageScene } = await import('/src/components/maze3d/scene.ts');
    const { readCanonicalHead } = await import('/src/persistence/canonical/read.ts'); const { projectGame } = await import('/src/persistence/canonical/game/projection.ts');
    const { head } = await readCanonicalHead(), scene = compileStageScene((await projectGame(head)).value)!;
    const library = new ThreeAssetLibrary(), warnings: string[] = [], shelves = new StageShelving(new AssetRegistry(), library, m => warnings.push(m));
    shelves.sync(scene.boxes); await shelves.ready; const children = [...shelves.root.children] as any[], uuids = children.map(m => m.geometry.uuid);
    for (let i = 0; i < 25; i++) shelves.sync(scene.boxes.map(b => ({ ...b })));
    const stable = JSON.stringify(uuids) === JSON.stringify((shelves.root.children as any[]).map(m => m.geometry.uuid)); let disposed = 0;
    for (const mesh of children) mesh.geometry.addEventListener('dispose', () => disposed++);
    shelves.dispose(); library.dispose(); return { warnings, stable, batches: children.length, disposed, remaining: shelves.root.children.length,
      boxes: scene.boxes.filter(b => b.material === 'bookshelf').map(b => ({ id: b.id, kind: b.furnishing, facing: b.facing, center: b.center, size: b.size })) };
  });
  expect(report.warnings).toEqual([]); expect(report.stable).toBe(true); expect(report.batches).toBeGreaterThan(2); expect(report.batches).toBeLessThanOrEqual(8);
  expect(report.disposed).toBe(report.batches); expect(report.remaining).toBe(0); expect(report.boxes.length).toBeGreaterThan(3);
  await page.getByLabel('3D camera').selectOption('third'); await frames(page); await page.screenshot({ path: info.outputPath('dungeon-shelving-avatar.png') });
  const counts = [];
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Return to 2D', exact: true }).click(); await page.getByRole('button', { name: '3D view', exact: true }).click();
    await expect(dungeon(page)).toHaveAttribute('data-shelving-status', 'ready'); await expect(dungeon(page)).toHaveAttribute('data-timber-status', 'ready'); await frames(page, 15);
    counts.push(await dungeon(page).evaluate(c => [(c as HTMLCanvasElement).dataset.geometries, (c as HTMLCanvasElement).dataset.texturesCount]));
  }
  expect(counts[1]).toEqual(counts[0]); expect(counts[2]).toEqual(counts[0]); await writeFile(info.outputPath('dungeon-shelving-resources.json'), JSON.stringify({ report, counts }, null, 2));
});

test('a missing shelving pack retains usable fallback geometry and game view switching', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/assets/model-packs/shelving/manifest.json', route => route.fulfill({ status: 404, body: 'optional pack absent' }));
  await page.goto('/tests/e2e/canonical-stairs.html?view=stage3d'); await expect(dungeon(page)).toHaveAttribute('data-shelving-status', 'fallback');
  await page.getByRole('button', { name: 'Return to 2D', exact: true }).click(); await expect(page.getByLabel('Dungeon map', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '3D view', exact: true }).click(); await expect(dungeon(page)).toHaveAttribute('data-shelving-status', 'fallback'); expect(errors).toEqual([]);
});
