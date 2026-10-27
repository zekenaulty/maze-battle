import { test, expect, type Page } from '@playwright/test';
const canvas = (page: Page) => page.getByLabel('Explorable 3D dungeon', { exact: true });
async function state(page: Page) { return page.evaluate(async () => {
  const { readCanonicalHead } = await import('/src/persistence/canonical/read.ts');
  const { projectGame } = await import('/src/persistence/canonical/game/projection.ts');
  const { compileStageScene } = await import('/src/components/maze3d/scene.ts');
  const { head } = await readCanonicalHead(), game = (await projectGame(head)).value, scene = compileStageScene(game)!;
  return { checkpoint: game.checkpoint, observation: game.observation!, spaces: game.observation!.header.spaces, spatial: game.spatial,
    shelves: scene.boxes.filter(b => b.material === 'bookshelf').length, flights: scene.flights?.length ?? 0,
    doors: scene.doors?.length ?? 0, cells: scene.cells.length };
}); }

test('fresh production games use empty furnishing policy through walking, 2D/3D switching and native reload', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?view=stage3d');
  await expect(canvas(page)).toBeVisible({ timeout: 60_000 });
  await expect(canvas(page)).toHaveAttribute('data-textures', 'ready', { timeout: 60_000 });
  const initial = await state(page);
  expect(initial.spaces!.filter(s => s.kind === 'room').every(s => s.furnishing === 'none')).toBe(true);
  expect(initial.shelves).toBe(0);
  await page.screenshot({ path: info.outputPath('fresh-open-chamber.png') });
  await page.getByRole('button', { name: 'Return to 2D', exact: true }).click();
  await expect(page.getByLabel('Dungeon map', { exact: true })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await state(page)).checkpoint.position.cell.column).toBe(initial.checkpoint.position.cell.column + 1);
  const moved = (await state(page)).checkpoint.position;
  await page.getByRole('button', { name: '3D view', exact: true }).click();
  await expect(canvas(page)).toBeVisible(); expect((await state(page)).shelves).toBe(0);
  await page.reload(); await expect(canvas(page)).toBeVisible({ timeout: 60_000 });
  expect((await state(page)).checkpoint.position).toEqual(moved);
  expect((await state(page)).shelves).toBe(0); expect(errors).toEqual([]);
});

for (const profile of ['circulation', 'dedicated']) test(`${profile} family supports native 3D passage movement, 2D/3D continuity and durable reload`, async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`/tests/e2e/canonical-stairs.html?view=stage3d&${profile}&junction`);
  await expect(canvas(page)).toBeVisible({ timeout: 60_000 });
  await expect(canvas(page)).toHaveAttribute('data-textures', 'ready', { timeout: 60_000 });
  const initial = await state(page);
  expect(initial.checkpoint.position.cell.spaceId).toBe('socket-0:room');
  expect(initial.spaces!.find(s => s.spaceId === 'socket-0:room')!.kind).toBe('passage');
  expect(initial.shelves).toBe(0);
  await page.screenshot({ path: info.outputPath('circulation-junction-3d.png') });
  const key = (at: unknown) => JSON.stringify(at), cells = new Map(initial.observation.cells.map(c => [key(c.at), c]));
  const kinds = new Map(initial.spaces!.map(s => [s.spaceId, s.kind]));
  const queue = [{ at: initial.checkpoint.position, path: [] as string[] }], seen = new Set<string>();
  let path: string[] | undefined;
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i], id = key(current.at); if (seen.has(id)) continue; seen.add(id);
    const cell = cells.get(id); if (!cell) continue;
    // Ordinal three is the controlled fixture's first straight run. Use only
    // disclosed cells to reach it; another junction would not qualify run travel.
    if (cell.at.cell.spaceId === 'socket-2:room' && kinds.get(cell.at.cell.spaceId) === 'passage') { path = current.path; break; }
    for (const [direction, to] of Object.entries(cell.edges)) if (to) queue.push({ at: to, path: [...current.path, direction] });
  }
  expect(path?.length).toBeGreaterThan(0);
  for (const direction of path!) {
    const target = ({ north: 0, east: -Math.PI / 2, south: Math.PI, west: Math.PI / 2 } as Record<string, number>)[direction];
    for (let i = 0; i < 16; i++) {
      const actual = Number(await canvas(page).getAttribute('data-yaw'));
      const difference = Math.atan2(Math.sin(target - actual), Math.cos(target - actual));
      if (Math.abs(difference) < .012) break;
      const b = (await canvas(page).boundingBox())!, dx = Math.max(-270, Math.min(270, -difference / .0025));
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2, { steps: 8 }); await page.mouse.up();
    }
    const before = (await state(page)).checkpoint.position;
    await page.keyboard.down('w');
    try {
      await expect.poll(async () => (await state(page)).checkpoint.position, { timeout: 10_000, intervals: [16] }).not.toEqual(before);
      await expect.poll(async () => {
        const pose = (await canvas(page).getAttribute('data-pose'))!.split(',').map(Number);
        const center = (await canvas(page).getAttribute('data-center'))!.split(',').map(Number);
        return Math.hypot(pose[0] - center[0], pose[1] - center[1]);
      }, { timeout: 5000, intervals: [16] }).toBeLessThan(.22);
    } finally { await page.keyboard.up('w'); }
  }
  const moved = (await state(page)).checkpoint.position;
  expect(moved.cell.spaceId).toBe('socket-2:room');
  expect((await state(page)).spaces!.find(s => s.spaceId === moved.cell.spaceId)!.kind).toBe('passage');
  await page.screenshot({ path: info.outputPath('circulation-run-3d.png') });
  await page.getByRole('button', { name: 'Return to 2D', exact: true }).click();
  await expect(page.getByLabel('Dungeon map', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('circulation-2d.png') });
  await page.getByRole('button', { name: '3D view', exact: true }).click();
  await expect(canvas(page)).toBeVisible(); expect((await state(page)).checkpoint.position).toEqual(moved);
  await page.reload(); await expect(canvas(page)).toBeVisible({ timeout: 60_000 });
  expect((await state(page)).checkpoint.position).toEqual(moved);
  expect((await state(page)).shelves).toBe(0); expect(errors).toEqual([]);
});

for (const profile of ['open', 'circulation', 'dedicated']) test(`${profile} generated stair rooms retain continuous down/up travel and reload with no arbitrary furnishing`, async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`/tests/e2e/canonical-stairs.html?view=stage3d&${profile}`);
  await expect(canvas(page)).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => (await state(page)).spatial?.prepareDown, { timeout: 60_000 }).toBe(false);
  await expect(canvas(page)).toHaveAttribute('data-textures', 'ready', { timeout: 60_000 });
  const initial = await state(page);
  expect(initial.flights).toBeGreaterThan(0); expect(initial.doors).toBeGreaterThan(0); expect(initial.shelves).toBe(0);
  expect(initial.spatial!.rooms!.every(r => r.furnishing === 'none')).toBe(true);
  await page.screenshot({ path: info.outputPath('open-upper-stairwell.png') });
  await page.keyboard.down('w');
  await expect.poll(async () => (await state(page)).checkpoint.position.level, { timeout: 20_000 }).toBe(2);
  await expect.poll(async () => Number(await canvas(page).getAttribute('data-height')), { timeout: 10_000 }).toBeCloseTo(-4.98, 2);
  await page.keyboard.up('w');
  expect((await state(page)).shelves).toBe(0);
  await page.screenshot({ path: info.outputPath('open-lower-stairwell.png') });
  await page.keyboard.down('s');
  await expect.poll(async () => (await state(page)).checkpoint.position.level, { timeout: 20_000 }).toBe(1);
  await expect.poll(async () => Number(await canvas(page).getAttribute('data-height')), { timeout: 10_000 }).toBeGreaterThan(-.03);
  await page.keyboard.up('s');
  expect((await state(page)).checkpoint.position).toEqual(initial.checkpoint.position);
  await page.reload(); await expect(canvas(page)).toBeVisible({ timeout: 60_000 });
  expect((await state(page)).checkpoint.position).toEqual(initial.checkpoint.position);
  expect((await state(page)).shelves).toBe(0); expect(errors).toEqual([]);
});

for (const profile of ['circulation', 'dedicated']) test(`real App Auto traverses ${profile} and releases manual control cleanly`, async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`/tests/e2e/canonical-stairs.html?view=stage3d&${profile}&junction`);
  await expect(canvas(page)).toHaveAttribute('data-textures', 'ready', { timeout: 60_000 });
  await expect.poll(async () => (await state(page)).spatial?.prepareDown, { timeout: 60_000 }).toBe(false);
  const visited = new Set<string>(), spaces = new Set<string>();
  await page.getByRole('button', { name: 'Auto', exact: true }).click();
  await expect(canvas(page)).toHaveAttribute('data-auto-follow', 'true');
  await expect.poll(async () => {
    const current = (await state(page)).checkpoint.position;
    visited.add(JSON.stringify(current)); spaces.add(current.cell.spaceId);
    return visited.size >= 12 && spaces.size >= 2;
  }, { timeout: 45_000, intervals: [150] }).toBe(true);
  await page.getByRole('button', { name: 'Stop Auto', exact: true }).click();
  await expect(canvas(page)).toHaveAttribute('data-auto-follow', 'false');
  await expect(canvas(page)).toHaveAttribute('data-auto-queue', '0');
  await expect.poll(async () => (await state(page)).checkpoint.mode).toBe('manual');
  expect((await state(page)).shelves).toBe(0); expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('circulation-auto-stopped.png') });
});
