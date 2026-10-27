import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const workshop = (page: Page) => page.getByLabel('Model and stair workshop', { exact: true });
const dungeon = (page: Page) => page.getByLabel('Explorable 3D dungeon', { exact: true });
async function frames(page: Page, n = 5) { await page.evaluate(n => new Promise<void>(resolve => { const tick = () => --n ? requestAnimationFrame(tick) : resolve(); requestAnimationFrame(tick); }), n); }
async function yaw(page: Page, target: number) {
  for (let i = 0; i < 12; i++) {
    const actual = Number(await dungeon(page).getAttribute('data-yaw')), diff = target - actual; if (Math.abs(diff) < .02) return;
    const b = (await dungeon(page).boundingBox())!, dx = Math.max(-420, Math.min(420, -diff / .0025));
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2, { steps: 4 }); await page.mouse.up();
  }
}
async function pitch(page: Page, target: number) {
  const actual = Number(await dungeon(page).getAttribute('data-pitch')), b = (await dungeon(page).boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 - (target - actual) / .0025, { steps: 5 }); await page.mouse.up();
}

test('real cabinet doors close flush and keyboard/touch controls open and close them without a game write', async ({ page }, info) => {
  await page.goto('/tests/e2e/canonical-stairs.html?view=stage3d'); await expect(dungeon(page)).toHaveAttribute('data-shelving-status', 'ready');
  const route = await page.evaluate(async () => {
    const { readCanonicalHead } = await import('/src/persistence/canonical/read.ts'), { projectGame } = await import('/src/persistence/canonical/game/projection.ts');
    const { compileStageScene } = await import('/src/components/maze3d/scene.ts');
    const game = (await projectGame((await readCanonicalHead()).head)).value, scene = compileStageScene(game)!;
    const cells = new Map(scene.cells.filter(c => c.source.at.level === scene.level).map(c => [c.key, c])), queue = [{ key: scene.actor.key, path: [] as string[] }], seen = new Set<string>();
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i]; if (seen.has(current.key)) continue; seen.add(current.key); const cell = cells.get(current.key); if (!cell) continue;
      const cabinet = scene.boxes.find(b => b.furnishing === 'cabinet' && b.id.startsWith(cell.key + '/'));
      if (cabinet) return { cabinet, path: current.path, centers: scene.cells.map(c => ({ key: c.key, center: c.center })) };
      for (const [dir, target] of Object.entries(cell.geometryEdges ?? cell.source.edges)) if (target) {
        const key = JSON.stringify([target.level, target.cell.spaceId, target.cell.row, target.cell.column]); if (cells.has(key)) queue.push({ key, path: [...current.path, dir] });
      }
    }
    throw Error('No reachable disclosed cabinet');
  });
  for (const direction of route.path) {
    await yaw(page, ({ north: 0, east: -Math.PI / 2, south: Math.PI, west: Math.PI / 2 })[direction]!);
    const actor = await dungeon(page).getAttribute('data-actor'); await page.keyboard.down('w');
    await expect.poll(() => dungeon(page).getAttribute('data-actor'), { timeout: 10_000, intervals: [16] }).not.toBe(actor);
    const key = await dungeon(page).getAttribute('data-actor'), center = route.centers.find(c => c.key === key)!.center;
    await expect.poll(async () => { const [x, z] = (await dungeon(page).getAttribute('data-pose'))!.split(',').map(Number); return Math.hypot(x - center.x, z - center.z); }, { timeout: 10_000, intervals: [16] }).toBeLessThan(.18);
    await page.keyboard.up('w');
  }
  const cabinet = route.cabinet, facing = cabinet.facing!, normal = ({ north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] })[facing];
  const [x, z] = (await dungeon(page).getAttribute('data-pose'))!.split(',').map(Number); await yaw(page, Math.atan2(x - cabinet.center[0], z - cabinet.center[2]));
  await page.keyboard.down('s');
  await expect.poll(async () => { const [x, z] = (await dungeon(page).getAttribute('data-pose'))!.split(',').map(Number); return (x - cabinet.center[0]) * normal[0] + (z - cabinet.center[2]) * normal[1]; }, { timeout: 6_000, intervals: [16] }).toBeGreaterThan(1.65);
  await page.keyboard.up('s');
  await pitch(page, -.42);
  const before = await dungeon(page).getAttribute('data-revision'); await page.screenshot({ path: info.outputPath('cabinet-flush-closed.png') });
  await page.keyboard.press('e');
  await expect.poll(async () => JSON.parse((await dungeon(page).getAttribute('data-cabinet-states'))!).find((s: any) => s.id === cabinet.id)?.open).toBe(true);
  await page.screenshot({ path: info.outputPath('cabinet-keyboard-open.png') });
  await page.getByRole('button', { name: 'Use nearby control', exact: true }).click();
  await expect.poll(async () => JSON.parse((await dungeon(page).getAttribute('data-cabinet-states'))!).find((s: any) => s.id === cabinet.id)?.open).toBe(false);
  expect(await dungeon(page).getAttribute('data-revision')).toBe(before);
  const fit = await page.evaluate(async () => {
    const p = await (await fetch('/assets/model-packs/shelving/manifest.json')).json(), a = Object.values(p.assets).find((a: any) => a.id.startsWith('shelving-cabinet')) as any;
    const parts = a.payload.geometries.main, front = Math.max(...parts.find((p: any) => p.id === 'side-left-sides').mesh.positions.map((v: number[]) => v[2]));
    const rear = parts.find((p: any) => p.id === 'hinge-left').position[2] + Math.min(...parts.find((p: any) => p.id === 'door-left-sides').mesh.positions.map((v: number[]) => v[2]));
    return { front, rear, gap: rear - front };
  });
  expect(Math.abs(fit.gap)).toBeLessThan(1e-6); await writeFile(info.outputPath('cabinet-fit.json'), JSON.stringify(fit, null, 2));
  await yaw(page, Number(await dungeon(page).getAttribute('data-yaw')) + .65); await pitch(page, .65); await frames(page);
  await page.screenshot({ path: info.outputPath('timber-corner-joint.png') });
});

test('optional construction strategies and per-face stair finishes remain bounded and reversible', async ({ page }, info) => {
  await page.goto('/tests/e2e/canonical-stairs.html?view=stage3d'); await expect(dungeon(page)).toHaveAttribute('data-timber-status', 'ready');
  await page.keyboard.down('s');
  await expect.poll(async () => Number((await dungeon(page).getAttribute('data-pose'))!.split(',')[1]), { timeout: 8_000, intervals: [16] }).toBeGreaterThan(2.2);
  await page.keyboard.up('s'); await pitch(page, .25);
  await page.getByText('Architecture options', { exact: true }).click();
  const counts: Record<string, number> = {};
  for (const label of ['Corner posts', 'Wall braces', 'Stair entry frame']) {
    await page.getByLabel(label, { exact: true }).check(); await frames(page);
    counts[label] = Number(await dungeon(page).getAttribute('data-supports')); expect(counts[label]).toBeGreaterThan(0);
    await page.screenshot({ path: info.outputPath(label.replaceAll(' ', '-') + '.png') });
    await page.getByText('Architecture options', { exact: true }).click(); await yaw(page, Math.PI); await pitch(page, .5); await frames(page);
    await page.screenshot({ path: info.outputPath(label.replaceAll(' ', '-') + '-room.png') });
    await yaw(page, 0); await pitch(page, .25); await page.getByText('Architecture options', { exact: true }).click();
    await page.getByLabel(label, { exact: true }).uncheck();
  }
  expect(counts['Wall braces']).toBeLessThan(40);
  for (const label of ['Corner posts', 'Wall braces', 'Stair entry frame', 'Dressed stone risers', 'Iron stair edging']) await page.getByLabel(label, { exact: true }).check();
  await expect(dungeon(page)).toHaveAttribute('data-stair-finish-ready', 'true'); await frames(page, 15);
  await page.getByText('Architecture options', { exact: true }).click(); await pitch(page, 0);
  await page.keyboard.down('w');
  await expect.poll(async () => JSON.parse((await dungeon(page).getAttribute('data-actor'))!)[0], { timeout: 25_000 }).toBe(2);
  await expect.poll(async () => Number(await dungeon(page).getAttribute('data-height')), { timeout: 10_000 }).toBeCloseTo(-4.98, 5);
  await page.keyboard.up('w'); await yaw(page, Math.PI); await pitch(page, .4); await frames(page);
  await page.screenshot({ path: info.outputPath('stairs-stone-iron-from-below.png') });
  await page.getByText('Architecture options', { exact: true }).click();
  await page.getByLabel('Dressed stone risers').uncheck(); await page.getByLabel('Iron stair edging').uncheck();
  await page.getByText('Architecture options', { exact: true }).click(); await frames(page);
  await page.screenshot({ path: info.outputPath('stairs-original-from-below.png') });
  await yaw(page, 0); await pitch(page, 0); await page.keyboard.down('s');
  await expect.poll(async () => JSON.parse((await dungeon(page).getAttribute('data-actor'))!)[0], { timeout: 25_000 }).toBe(1);
  await expect.poll(async () => Number(await dungeon(page).getAttribute('data-height')), { timeout: 10_000 }).toBeGreaterThan(-.03); await page.keyboard.up('s');
  await page.getByText('Architecture options', { exact: true }).click();
  for (const label of ['Corner posts', 'Wall braces', 'Stair entry frame']) await page.getByLabel(label, { exact: true }).uncheck();
  await expect(dungeon(page)).toHaveAttribute('data-supports', '0'); await writeFile(info.outputPath('support-strategies.json'), JSON.stringify(counts, null, 2));
});

test('missing optional construction textures leave no invisible posts or altered stair faces', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/assets/model-packs/timber/manifest.json', route => route.fulfill({ status: 404, body: 'optional pack absent' }));
  await page.route('**/assets/model-packs/stage-details/manifest.json', route => route.fulfill({ status: 404, body: 'optional pack absent' }));
  await page.goto('/tests/e2e/canonical-stairs.html?view=stage3d'); await expect(dungeon(page)).toHaveAttribute('data-timber-status', 'unavailable');
  await page.getByText('Architecture options', { exact: true }).click();
  for (const label of ['Corner posts', 'Wall braces', 'Stair entry frame', 'Dressed stone risers', 'Iron stair edging']) await page.getByLabel(label, { exact: true }).check();
  await expect(dungeon(page)).toHaveAttribute('data-supports', '0'); await expect(dungeon(page)).toHaveAttribute('data-stair-finish-ready', 'false');
  expect(errors).toEqual([]);
});

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
