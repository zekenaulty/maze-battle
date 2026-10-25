import { test, expect, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const canvas = (page: Page) => page.getByLabel('Explorable 3D dungeon', { exact: true });
async function look(page: Page, yaw: number, pitch = 0) {
  for (let i = 0; i < 10; i++) {
    const actual = Number(await canvas(page).getAttribute('data-yaw')), difference = yaw - actual;
    if (Math.abs(difference) < .02) break;
    const b = (await canvas(page).boundingBox())!, dx = Math.max(-450, Math.min(450, -difference / .0025));
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2, { steps: 4 }); await page.mouse.up();
  }
  if (pitch) { const b = (await canvas(page).boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 - pitch / .0025, { steps: 4 }); await page.mouse.up(); }
}
async function state(page: Page) { return page.evaluate(async () => {
  const { readCanonicalHead } = await import('/src/persistence/canonical/read.ts');
  const { projectGame } = await import('/src/persistence/canonical/game/projection.ts');
  const { head } = await readCanonicalHead(); return { head, game: (await projectGame(head)).value };
}); }
async function prepared(page: Page) {
  await page.goto('/tests/e2e/canonical-stairs.html?view=stage3d');
  await expect(canvas(page)).toBeVisible({ timeout: 60_000 });
  const node = await canvas(page).elementHandle(), before = await state(page);
  await expect.poll(async () => (await state(page)).game.spatial?.prepareDown, { timeout: 60_000 }).toBe(false);
  await expect.poll(async () => (await state(page)).game.spatial?.connectors?.some((c: any) => c.travelReady), { timeout: 60_000 }).toBe(true);
  expect(await node!.evaluate(n => n.isConnected)).toBe(true);
  const after = await state(page);
  expect(after.game.checkpoint.position).toEqual(before.game.checkpoint.position);
  expect(after.head.roots.knowledge).toBe(before.head.roots.knowledge);
  expect(after.game.spatial!.version).toBe('stair-room-sight-v2');
  expect(after.game.spatial!.rooms!.some((r: any) => r.level === 2)).toBe(true);
  expect(after.game.spatial!.rooms!.flatMap((r: any) => r.cells).every((c: any) => c.chests.length === 0 && c.stairs.length === 0)).toBe(true);
  return after;
}
test('seeded real stairs prepare separately, cross continuously, reverse, reload and preserve 2D knowledge', async ({ page }, info) => {
  await prepared(page); const node = await canvas(page).elementHandle(), source = (await state(page)).game.checkpoint.position;
  // Structural sight stays while moving within the stair room, away from its exact endpoint.
  await look(page, 0); await page.keyboard.down('d');
  await expect.poll(async () => (await state(page)).game.checkpoint.position.cell.column, { timeout: 10_000 }).toBe(source.cell.column + 1);
  await page.keyboard.up('d');
  expect((await state(page)).game.spatial!.rooms!.some((r: any) => r.level === 2)).toBe(true);
  expect(await node!.evaluate(n => n.isConnected)).toBe(true);
  await page.keyboard.down('a');
  await expect.poll(async () => Math.abs(Number((await canvas(page).getAttribute('data-pose'))!.split(',')[0])), { timeout: 10_000, intervals: [16] }).toBeLessThan(.3);
  await page.keyboard.up('a');
  expect((await state(page)).game.checkpoint.position).toEqual(source);
  await look(page, 0, -.55); await page.screenshot({ path: info.outputPath('upper-landing.png') });
  await look(page, 0, .55);
  await page.evaluate(() => {
    const probe = { active: true, samples: [] as unknown[] }; (window as any).__stairProbe = probe;
    const tick = (t: number) => {
      const c = document.querySelector<HTMLCanvasElement>('[aria-label="Explorable 3D dungeon"]');
      if (!probe.active || !c) return;
      probe.samples.push({ t, pose: c.dataset.pose, y: Number(c.dataset.height), progress: c.dataset.stairProgress, actor: c.dataset.actor }); requestAnimationFrame(tick);
    }; requestAnimationFrame(tick);
  });
  await page.keyboard.down('w');
  await expect.poll(async () => (await state(page)).game.checkpoint.position.level, { timeout: 20_000 }).toBe(2);
  await expect.poll(async () => Number(await canvas(page).getAttribute('data-height')), { timeout: 10_000 }).toBeLessThan(-4.65);
  await page.keyboard.up('w');
  expect(await node!.evaluate(n => n.isConnected)).toBe(true);
  await look(page, Math.PI, .4); await page.screenshot({ path: info.outputPath('lower-landing.png') });
  await look(page, 0, -.4);
  const down = await state(page);
  expect(down.game.observation!.cells.every((c: any) => c.at.level === 2)).toBe(true);
  // Reverse on the same flight, without a camera reset or an extra ordinary move.
  await page.keyboard.down('s');
  await expect.poll(async () => (await state(page)).game.checkpoint.position.level, { timeout: 20_000 }).toBe(1);
  await expect.poll(async () => Number(await canvas(page).getAttribute('data-height')), { timeout: 10_000 }).toBeGreaterThan(-.03);
  await page.keyboard.up('s');
  const up = await state(page); expect(up.game.checkpoint.position).toEqual(source);
  await page.screenshot({ path: info.outputPath('returned-upper.png') });
  const samples = await page.evaluate(() => { const p = (window as any).__stairProbe; p.active = false; return p.samples; });
  await writeFile(info.outputPath('stair-motion.json'), JSON.stringify(samples, null, 2));
  const ys = samples.map((s: any) => s.y), jumps = ys.slice(1).map((y: number, i: number) => Math.abs(y - ys[i]));
  expect(Math.max(...jumps)).toBeLessThan(.16); // capped input step and smooth ramp, including both commits
  await page.getByRole('button', { name: 'Return to 2D', exact: true }).click();
  await expect(page.getByLabel('Dungeon map', { exact: true })).toBeVisible();
  expect((await state(page)).game.checkpoint.position).toEqual(source);
  await page.getByRole('button', { name: '3D view', exact: true }).click(); await expect(canvas(page)).toBeVisible();
  await page.reload(); await expect(canvas(page)).toBeVisible();
  expect((await state(page)).game.checkpoint.position).toEqual(up.game.checkpoint.position);
});
test('legacy retained recipe keeps explicit stair travel without acquiring spatial placement', async ({ page }) => {
  await page.goto('/tests/e2e/canonical-stairs.html?view=stage3d&legacy=1');
  await expect(canvas(page)).toBeVisible({ timeout: 60_000 });
  expect((await state(page)).game.spatial).toBeUndefined();
  await page.getByRole('button', { name: 'Use down stairs', exact: true }).click();
  await expect.poll(async () => (await state(page)).game.checkpoint.position.level, { timeout: 60_000 }).toBe(2);
  expect((await state(page)).game.spatial).toBeUndefined();
});
test.describe('imported controls with touch input', () => {
test.use({ hasTouch: true });
test('walks to an imported door control and toggles its visual state with E and the touch control', async ({ page }, info) => {
  await prepared(page); await look(page, 0);
  const route = await page.evaluate(async () => {
    const { readCanonicalHead } = await import('/src/persistence/canonical/read.ts');
    const { projectGame } = await import('/src/persistence/canonical/game/projection.ts');
    const { compileStageScene } = await import('/src/components/maze3d/scene.ts');
    const { head } = await readCanonicalHead(), game = (await projectGame(head)).value, at = game.checkpoint.position;
    const scene = compileStageScene(game)!;
    const key = (p: typeof at) => JSON.stringify([p.level, p.cell.spaceId, p.cell.row, p.cell.column]);
    // Use only the room geometry already disclosed to the renderer, never resident world reads.
    const room = game.spatial!.rooms!.find(r => r.level === at.level && r.spaceId === at.cell.spaceId)!;
    const cells = new Map(room.cells.map(c => [key(c.at), c]));
    const queue = [key(at)], visited = new Set(queue), previous = new Map<string, { from: string; direction: string }>();
    for (let i = 0; i < queue.length; i++) {
      const cell = cells.get(queue[i])!;
      const exit = Object.entries(cell.edges).find(([, to]) => to && to.cell.spaceId !== at.cell.spaceId);
      if (exit) {
        const steps: { direction: string; to: typeof at; center: { x: number; z: number } }[] = [];
        for (let id = key(cell.at); id !== key(at);) {
          const p = previous.get(id)!;
          steps.push({ direction: p.direction, to: cells.get(id)!.at, center: scene.cells.find(c => c.key === id)!.center }); id = p.from;
        }
        return { steps: steps.reverse(), doorDirection: exit[0], endpoint: cell.at };
      }
      for (const [direction, to] of Object.entries(cell.edges)) if (to && cells.has(key(to)) && !visited.has(key(to))) {
        visited.add(key(to)); queue.push(key(to)); previous.set(key(to), { from: key(cell.at), direction });
      }
    }
    throw Error('No door in the disclosed stair room');
  });
  const keys: Record<string, string> = { north: 'w', south: 's', east: 'd', west: 'a' };
  for (const step of route.steps) {
    await page.keyboard.down(keys[step.direction]);
    await expect.poll(async () => {
      const at = (await state(page)).game.checkpoint.position;
      return [at.level, at.cell.spaceId, at.cell.row, at.cell.column];
    }, { timeout: 10_000, intervals: [50] }).toEqual([step.to.level, step.to.cell.spaceId, step.to.cell.row, step.to.cell.column]);
    await expect.poll(async () => canvas(page).evaluate((c, center) => {
      const pose = (c.dataset.pose ?? '').split(',').map(Number);
      return Math.hypot(pose[0] - center.x, pose[1] - center.z);
    }, step.center), { timeout: 10_000, intervals: [16] }).toBeLessThan(.25);
    await page.keyboard.up(keys[step.direction]);
  }
  expect((await state(page)).game.checkpoint.position).toEqual(route.endpoint);
  // Stay within interaction reach while outside automatic doorway opening distance.
  const reverse: Record<string, string> = { north: 's', south: 'w', east: 'a', west: 'd' };
  await page.keyboard.down(reverse[route.doorDirection]); await page.waitForTimeout(90); await page.keyboard.up(reverse[route.doorDirection]);
  await look(page, ({ north: 0, east: -Math.PI / 2, south: Math.PI, west: Math.PI / 2 })[route.doorDirection]!);
  await expect(canvas(page)).toHaveAttribute('data-nearby-control', /lever|button/);
  const before = await state(page), readVisual = () => canvas(page).getAttribute('data-door-states');
  await writeFile(info.outputPath('imported-control-context.json'), JSON.stringify({ route, position: before.game.checkpoint.position,
    canvas: await canvas(page).evaluate(c => ({ ...c.dataset })), doors: await page.evaluate(async () => {
      const { readCanonicalHead } = await import('/src/persistence/canonical/read.ts');
      const { projectGame } = await import('/src/persistence/canonical/game/projection.ts');
      const { compileStageScene } = await import('/src/components/maze3d/scene.ts');
      const { head } = await readCanonicalHead(); return compileStageScene((await projectGame(head)).value)!.doors;
    }) }, null, 2));
  await page.screenshot({ path: info.outputPath('imported-door-control-before.png') });
  const initial = await readVisual(); expect(initial).toBeTruthy();
  await page.keyboard.press('e');
  await expect.poll(readVisual, { intervals: [16] }).not.toBe(initial);
  await expect(page.getByRole('status').filter({ hasText: /Lever switched|Button pressed/ })).toBeVisible();
  await page.screenshot({ path: info.outputPath('imported-door-control-keyboard.png') });
  const keyboard = await readVisual();
  await page.getByRole('button', { name: 'Use nearby control', exact: true }).tap();
  await expect.poll(readVisual, { intervals: [16] }).not.toBe(keyboard);
  await page.screenshot({ path: info.outputPath('imported-door-control-touch.png') });
  const endpointKey = JSON.stringify([route.endpoint.level, route.endpoint.cell.spaceId, route.endpoint.cell.row, route.endpoint.cell.column]);
  const doorId = JSON.parse((await readVisual())!).find((door: any) => door.id.includes(endpointKey)).id as string;
  const selectedDoor = async () => JSON.parse((await readVisual())!).find((door: any) => door.id === doorId);
  const center = route.steps.at(-1)!.center;
  const direction = ({ north: { x: 0, z: -1 }, south: { x: 0, z: 1 }, east: { x: 1, z: 0 }, west: { x: -1, z: 0 } })[route.doorDirection]!;
  const distanceFromCenter = () => canvas(page).evaluate((c, input) => {
    const pose = c.dataset.pose!.split(',').map(Number);
    return (pose[0] - input.center.x) * input.direction.x + (pose[1] - input.center.z) * input.direction.z;
  }, { center, direction });
  // Approach can open the visual door, but must not undo an explicit close every frame.
  await page.keyboard.down('w');
  await expect.poll(distanceFromCenter, { intervals: [16] }).toBeGreaterThan(.25);
  await page.keyboard.up('w'); await expect.poll(async () => (await selectedDoor()).open).toBe(true);
  await page.keyboard.press('e'); await expect.poll(async () => (await selectedDoor()).open).toBe(false);
  const stayedClosed = await canvas(page).evaluate(async (c, id) => {
    for (let frame = 0; frame < 24; frame++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (JSON.parse(c.dataset.doorStates!).find((door: any) => door.id === id)?.open !== false) return false;
    }
    return true;
  }, doorId);
  expect(stayedClosed).toBe(true);
  await page.screenshot({ path: info.outputPath('imported-door-manual-close-in-approach-zone.png') });
  await page.keyboard.down('s');
  await expect.poll(distanceFromCenter, { intervals: [16] }).toBeLessThan(-.25);
  await page.keyboard.up('s'); expect((await selectedDoor()).open).toBe(false);
  await page.keyboard.down('w');
  await expect.poll(distanceFromCenter, { intervals: [16] }).toBeGreaterThan(.25);
  await page.keyboard.up('w'); await expect.poll(async () => (await selectedDoor()).open).toBe(true);
  await page.screenshot({ path: info.outputPath('imported-door-reopened-after-reentry.png') });
  const after = await state(page);
  expect(after.game.checkpoint.position).toEqual(before.game.checkpoint.position);
  expect(after.head.roots).toEqual(before.head.roots); expect(after.head.revision).toBe(before.head.revision);
});
});
test('manual save restores spatial placement and the defined committed landing after later travel', async ({ page }) => {
  const source = (await prepared(page)).game.checkpoint.position;
  await page.getByRole('button', { name: 'Saves', exact: true }).click();
  await page.getByRole('button', { name: 'New save', exact: true }).click();
  await expect(page.getByText('Manual save created.', { exact: true })).toBeVisible();
  await page.getByRole('dialog', { name: 'Saves', exact: true }).getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.keyboard.down('w');
  await expect.poll(async () => (await state(page)).game.checkpoint.position.level, { timeout: 20_000 }).toBe(2);
  await page.keyboard.up('w'); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Saves', exact: true }).click();
  await page.locator('.save-row').filter({ hasText: 'manual' }).getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('button', { name: 'Load save', exact: true }).click();
  await expect(canvas(page)).toBeVisible();
  await expect.poll(async () => (await state(page)).game.checkpoint.position).toEqual(source);
  await expect.poll(() => canvas(page).getAttribute('data-stair-progress')).toBe('');
  expect((await state(page)).game.spatial!.connector!.placement.version).toBe('straight-stair-placement-v1');
});
test('interrupted preparation resumes automatically after reload without remounting or moving the actor', async ({ page }, info) => {
  await page.goto('/tests/e2e/canonical-stairs.html?view=stage3d&partial=1'); await expect(canvas(page)).toBeVisible({ timeout: 60_000 });
  await page.reload(); await expect(canvas(page)).toBeVisible();
  const node = await canvas(page).elementHandle(), before = await state(page);
  await expect.poll(async () => (await state(page)).game.spatial?.prepareDown, { timeout: 60_000 }).toBe(false);
  expect(await node!.evaluate(n => n.isConnected)).toBe(true);
  expect(await canvas(page).getAttribute('data-stair-progress')).toBe('');
  await page.screenshot({ path: info.outputPath('automatically-prepared-after-reload.png') });
  expect((await state(page)).game.checkpoint.position).toEqual(before.game.checkpoint.position);
});
async function dump(page: Page) { return page.evaluate(async () => {
  const { openCanonicalDatabase } = await import('/src/persistence/canonical/database.ts');
  const db = await openCanonicalDatabase(); try {
    return await Promise.all(['heads','records','nodes','receipts','operations'].map(async store => [store, await db.getAll(store as any)] as const));
  } finally { db.close(); }
}); }
test('automatic preparation failure does not travel and an explicit reload can retry', async ({ page }, info) => {
  await page.goto('/tests/e2e/canonical-stairs.html?view=stage3d&failprepare=1');
  await expect(page.getByText(/Action failed:/)).toBeVisible();
  const failed = await state(page), source = failed.game.checkpoint.position, snapshot = await dump(page);
  expect(source.level).toBe(1);
  expect(snapshot.find(([store]) => store === 'records')![1].some((row: any) => row.key === 'game/preparation/2')).toBe(false);
  await info.attach('automatic-preparation-failure.json', { body: JSON.stringify({ failed, snapshot }), contentType: 'application/json' });
  await page.reload(); await expect(canvas(page)).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => (await state(page)).game.spatial?.prepareDown, { timeout: 60_000 }).toBe(false);
  expect((await state(page)).game.checkpoint.position).toEqual(source);
});
