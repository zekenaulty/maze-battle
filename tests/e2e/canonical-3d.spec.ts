import { test, expect, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

async function state(page: Page) {
  return page.evaluate(async () => {
    const { readCanonicalHead } = await import('/src/persistence/canonical/read.ts');
    const { projectGame } = await import('/src/persistence/canonical/game/projection.ts');
    const { head } = await readCanonicalHead(), game = (await projectGame(head)).value;
    return { head: { ...head, checkpoint: game.checkpoint }, observation: game.observation };
  });
}
const canvas = (page: Page) => page.getByLabel('Explorable 3D dungeon', { exact: true });
const xy = (value: string | null) => (value ?? '0,0').split(',').map(Number);
for (const width of [1440, 390]) for (const dpr of [1, 2]) {
  test(`2D follow, inspect, click and fog continuity ${width} DPR ${dpr}`, async ({ browser }, info) => {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 960 }, deviceScaleFactor: dpr });
    const page = await context.newPage(), map = page.getByLabel('Dungeon map', { exact: true });
    try {
      await page.goto('http://127.0.0.1:5206/tests/e2e/canonical-3d.html');
      await expect(map).toBeVisible(); await expect(map).not.toHaveAttribute('aria-busy', 'true');
      const assertCentered = async () => {
        const current = await state(page), actor = current.observation!.cells.find((c: any) => JSON.stringify(c.at) === JSON.stringify(current.observation!.header.actor))!;
        await expect.poll(async () => map.evaluate((c, world) => {
          const canvas = c as HTMLCanvasElement;
          return [world.row - Number(canvas.dataset.rowStart), world.column - Number(canvas.dataset.columnStart)];
        }, actor.world)).toEqual([Math.floor(Number(await map.getAttribute('data-rows')) / 2), Math.floor(Number(await map.getAttribute('data-columns')) / 2)]);
        return actor;
      };
      await assertCentered();
      expect(Number(await map.getAttribute('data-row-start'))).toBeLessThan(0);
      expect(Number(await map.getAttribute('data-column-start'))).toBeLessThan(0);
      // Sample every presented frame around the actor; an empty evidence frame is background-only.
      await page.evaluate(() => {
        const probe = { active: true, bright: [] as number[] }; (window as any).__fogProbe = probe;
        const tick = () => {
          const c = document.querySelector<HTMLCanvasElement>('[aria-label="Dungeon map"]');
          if (!probe.active || !c) return;
          const pixels = c.getContext('2d')!.getImageData(Math.floor(c.width / 2) - 16, Math.floor(c.height / 2) - 16, 32, 32).data;
          let max = 0; for (let i = 0; i < pixels.length; i += 4) max = Math.max(max, pixels[i], pixels[i + 1], pixels[i + 2]);
          probe.bright.push(max); requestAnimationFrame(tick);
        }; requestAnimationFrame(tick);
      });
      for (let i = 0; i < 6; i++) {
        const before = (await state(page)).head;
        await page.keyboard.press('ArrowRight');
        await expect.poll(async () => (await state(page)).head.revision).toBe(before.revision + 1);
        await assertCentered(); await expect(map).not.toHaveAttribute('aria-busy', 'true');
      }
      const bright = await page.evaluate(() => { const p = (window as any).__fogProbe; p.active = false; return p.bright as number[]; });
      expect(bright.length).toBeGreaterThan(10); expect(Math.min(...bright)).toBeGreaterThan(40);
      await writeFile(info.outputPath('fog-continuity.json'), JSON.stringify({ samples: bright.length, darkestFrameMaximum: Math.min(...bright) }));
      await page.screenshot({ path: info.outputPath('centered-2d.png') });

      const beforeInspect = (await state(page)).head;
      await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
      const zoom = await page.getByLabel(/Camera zoom/).getAttribute('aria-label');
      const area = (await map.boundingBox())!, origin = await map.getAttribute('data-column-start');
      await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2); await page.mouse.down();
      await page.mouse.move(area.x + area.width / 2 + 80, area.y + area.height / 2, { steps: 5 }); await page.mouse.up();
      await expect(map).not.toHaveAttribute('data-column-start', origin!);
      expect((await state(page)).head.revision).toBe(beforeInspect.revision);
      // CSS hit geometry must be independent of backing-store DPR.
      const current = await state(page), actor = current.observation!.cells.find((c: any) => JSON.stringify(c.at) === JSON.stringify(beforeInspect.checkpoint.position))!;
      const to = current.observation!.cells.find((c: any) => JSON.stringify(c.at) === JSON.stringify(actor.edges.east))!;
      const point = await map.evaluate((c, target) => {
        const canvas = c as HTMLCanvasElement, b = c.getBoundingClientRect(), w = Math.floor(b.width), h = Math.floor(b.height);
        const rows = Number(canvas.dataset.rows), columns = Number(canvas.dataset.columns), cell = Math.floor(Math.min((w - 16) / columns, (h - 16) / rows));
        return { x: b.x + Math.floor((w - columns * cell) / 2) + (target.column - Number(canvas.dataset.columnStart) + 0.5) * cell,
          y: b.y + Math.floor((h - rows * cell) / 2) + (target.row - Number(canvas.dataset.rowStart) + 0.5) * cell };
      }, to.world);
      await page.mouse.click(point.x, point.y);
      await expect.poll(async () => (await state(page)).head.checkpoint.position).toEqual(to.at);
      await assertCentered(); expect(await page.getByLabel(/Camera zoom/).getAttribute('aria-label')).toBe(zoom);
      await page.setViewportSize({ width: width === 390 ? 460 : 1000, height: 800 });
      await expect(map).not.toHaveAttribute('aria-busy', 'true'); await assertCentered();
      await page.screenshot({ path: info.outputPath('inspect-move-resized.png') });
    } finally { await context.close(); }
  });
}

test('continuous movement timing through twenty canonical cells', async ({ page }, info) => {
  await page.goto('/tests/e2e/canonical-3d.html?view=stage3d'); await ready(page);
  await turn(page, 'east');
  await page.evaluate(() => {
    const sample: Array<{ t: number; x: number; pending: boolean }> = [];
    const probe = { sample, active: true };
    (window as any).__stageMotion = probe;
    const tick = (t: number) => {
      const canvas = document.querySelector<HTMLCanvasElement>('[aria-label="Explorable 3D dungeon"]');
      if (!probe.active || !canvas) return;
      if (sample.length < 3600) sample.push({ t, x: Number(canvas.dataset.pose?.split(',')[0]), pending: canvas.dataset.pending === 'true' });
      requestAnimationFrame(tick);
    }; requestAnimationFrame(tick);
  });
  await page.keyboard.down('w');
  await expect.poll(async () => Number((await canvas(page).getAttribute('data-world'))?.split(',')[1]), { timeout: 60_000, intervals: [50] }).toBeGreaterThanOrEqual(22);
  await page.keyboard.up('w');
  const samples = await page.evaluate(() => { const probe = (window as any).__stageMotion; probe.active = false; return probe.sample as Array<{ t: number; x: number; pending: boolean }>; });
  const frames = samples.slice(1).map((s, i) => ({ ms: s.t - samples[i].t, dx: s.x - samples[i].x, pending: s.pending || samples[i].pending }));
  const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))];
  let stopped = 0, longest = 0;
  for (const frame of frames) { stopped = frame.pending && Math.abs(frame.dx) < 0.0001 ? stopped + frame.ms : 0; longest = Math.max(longest, stopped); }
  const stats = { frames: frames.length, elapsedMs: samples.at(-1)!.t - samples[0].t,
    rafP50: percentile(frames.map(f => f.ms), 0.5), rafP95: percentile(frames.map(f => f.ms), 0.95), maxFrameMs: Math.max(...frames.map(f => f.ms)),
    pendingStoppedFrames: frames.filter(f => f.pending && Math.abs(f.dx) < 0.0001).length, longestPendingStopMs: longest,
    distance: samples.at(-1)!.x - samples[0].x };
  await writeFile(info.outputPath('motion.json'), JSON.stringify(stats, null, 2));
  console.log('Motion profile', JSON.stringify(stats));
  expect(stats.distance).toBeGreaterThan(60);
  // Canonical commits must not repeatedly freeze the camera at cell boundaries.
  expect(stats.longestPendingStopMs).toBeLessThan(50);
  expect(stats.pendingStoppedFrames).toBeLessThan(10);
});
async function ready(page: Page) {
  await expect(canvas(page)).toBeVisible({ timeout: 60_000 });
  await expect(canvas(page)).toHaveAttribute('data-textures', 'ready');
  await expect(page.getByRole('alert')).toHaveCount(0);
}
async function turn(page: Page, direction: string) {
  const target = ({ north: 0, east: -Math.PI / 2, south: Math.PI, west: Math.PI / 2 })[direction]!;
  await lookYaw(page, target);
}
async function lookYaw(page: Page, target: number) {
  for (let i = 0; i < 16; i++) {
    const yaw = Number(await canvas(page).getAttribute('data-yaw'));
    const difference = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
    if (Math.abs(difference) < 0.012) return;
    const bounds = (await canvas(page).boundingBox())!, x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
    const dx = Math.max(-Math.min(270, bounds.width * 0.4), Math.min(Math.min(270, bounds.width * 0.4), -difference / 0.0025));
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y, { steps: 8 }); await page.mouse.up();
    await expect.poll(async () => Number(await canvas(page).getAttribute('data-yaw'))).not.toBe(yaw);
  }
  throw Error('Unable to turn camera');
}
async function walkOne(page: Page, direction: string) {
  await turn(page, direction);
  const before = await canvas(page).getAttribute('data-world');
  await page.keyboard.down('w');
  try {
    await expect.poll(() => canvas(page).getAttribute('data-world'), { timeout: 10_000, intervals: [16] }).not.toBe(before);
    // Continue physically to this tile's center, so the next turn approaches doorways centrally.
    await expect.poll(async () => {
      const pose = xy(await canvas(page).getAttribute('data-pose')), center = xy(await canvas(page).getAttribute('data-center'));
      return Math.hypot(pose[0] - center[0], pose[1] - center[1]);
    }, { timeout: 5000, intervals: [16] }).toBeLessThan(0.22);
  } finally { await page.keyboard.up('w'); }
  await expect(canvas(page)).toHaveAttribute('data-pending', 'false');
}
function route(observation: any, predicate: (cell: any) => boolean): string[] | undefined {
  const key = (at: any) => JSON.stringify(at), byKey = new Map(observation.cells.map((c: any) => [key(c.at), c]));
  const seen = new Set<string>(), queue = [{ at: observation.header.actor, path: [] as string[] }];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i], id = key(current.at); if (seen.has(id)) continue; seen.add(id);
    const cell: any = byKey.get(id); if (!cell) continue;
    if (predicate(cell)) return current.path;
    for (const [direction, target] of Object.entries(cell.edges)) if (target && byKey.has(key(target))) queue.push({ at: target, path: [...current.path, direction] });
  }
}

test('materials survive repeated view switches and can recover from an unavailable manifest', async ({ page }, info) => {
  await page.goto('/?view=stage3d'); await ready(page);
  await expect.poll(async () => Number(await canvas(page).getAttribute('data-textures-count'))).toBeGreaterThan(0);
  const before = await state(page), original = await canvas(page).screenshot();
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'Return to 2D', exact: true }).click();
    await page.getByRole('button', { name: '3D view', exact: true }).click(); await ready(page);
    await expect.poll(async () => Number(await canvas(page).getAttribute('data-textures-count'))).toBeGreaterThan(0);
    expect(await canvas(page).screenshot()).toEqual(original);
    expect((await state(page)).head.revision).toBe(before.head.revision);
  }
  const manifest = '**/assets/material-packs/**/manifest.json';
  await page.route(manifest, route => route.abort('connectionrefused'));
  await page.getByRole('button', { name: 'Return to 2D', exact: true }).click();
  await page.getByRole('button', { name: '3D view', exact: true }).click();
  await expect(canvas(page)).toHaveAttribute('data-textures', 'fallback');
  await expect(page.getByText('Textures are unavailable. Showing plain materials.', { exact: true })).toBeVisible();
  await page.unroute(manifest);
  await page.getByRole('button', { name: 'Retry materials', exact: true }).click(); await ready(page);
  await expect.poll(async () => Number(await canvas(page).getAttribute('data-textures-count'))).toBeGreaterThan(0);
  expect(await canvas(page).screenshot()).toEqual(original);
  expect((await state(page)).head.revision).toBe(before.head.revision);
  await page.screenshot({ path: info.outputPath('restored-materials.png') });
});

for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
  test(`canonical 3D local movement, committed step, map and reload ${viewport.width}`, async ({ page }, info) => {
    const errors: string[] = [], requests: string[] = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('request', r => requests.push(r.url()));
    await page.setViewportSize(viewport); await page.goto('/?view=stage3d'); await ready(page);
    const before = await state(page), initial = await canvas(page).getAttribute('data-pose');
    await page.keyboard.down('d');
    await expect.poll(() => canvas(page).getAttribute('data-pose'), { intervals: [16] }).not.toBe(initial);
    await page.keyboard.up('d');
    expect((await state(page)).head.checkpoint.position).toEqual(before.head.checkpoint.position);
    expect((await state(page)).head.revision).toBe(before.head.revision);
    await page.screenshot({ path: info.outputPath('first-person.png') });
    const actor = before.observation!.cells.find((c: any) => JSON.stringify(c.at) === JSON.stringify(before.head.checkpoint.position))!;
    const direction = Object.entries(actor.edges).find(([, to]) => to)?.[0]; expect(direction).toBeTruthy();
    // Re-entering the view recenters presentation only; it must not write the game.
    await page.getByRole('button', { name: 'Return to 2D', exact: true }).click();
    await expect(page.locator('canvas')).toHaveCount(1);
    expect((await state(page)).head.revision).toBe(before.head.revision);
    await page.getByRole('button', { name: '3D view', exact: true }).click(); await ready(page);
    await walkOne(page, direction!);
    const moved = await state(page);
    expect(moved.head.revision).toBe(before.head.revision + 1);
    expect(await canvas(page).getAttribute('data-actor')).toBe(JSON.stringify([moved.head.checkpoint.position.level,
      moved.head.checkpoint.position.cell.spaceId, moved.head.checkpoint.position.cell.row, moved.head.checkpoint.position.cell.column]));
    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Rooms', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('earned-map.png') });
    await page.getByRole('button', { name: 'Map', exact: true }).click(); await ready(page);
    await page.getByLabel('3D camera', { exact: true }).selectOption('third');
    await page.getByLabel('Player appearance', { exact: true }).selectOption('gilded-mage');
    await page.screenshot({ path: info.outputPath('follow-player.png') });
    await page.reload(); await ready(page);
    expect((await state(page)).head.checkpoint.position).toEqual(moved.head.checkpoint.position);
    expect(requests.some(url => /textures\/glowstone\//.test(url))).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Return to 2D', exact: true }).click();
    const twoD = await state(page), at = JSON.stringify(twoD.head.checkpoint.position);
    const current = twoD.observation!.cells.find((c: any) => JSON.stringify(c.at) === at)!;
    const step = Object.entries(current.edges).find(([, to]) => to && twoD.observation!.cells.some((c: any) => JSON.stringify(c.at) === JSON.stringify(to) && !c.stairs.length))!;
    await page.keyboard.press(({ north: 'ArrowUp', east: 'ArrowRight', south: 'ArrowDown', west: 'ArrowLeft' })[step[0]]!);
    await expect.poll(async () => (await state(page)).head.revision).toBe(twoD.head.revision + 1);
    expect((await state(page)).head.checkpoint.position).toEqual(step[1]);
    expect(errors).toEqual([]);
  });
}

test('authored canonical rooms, passages, chest and stairs remain playable', async ({ page }, info) => {
  await page.goto('/tests/e2e/canonical-3d.html?view=stage3d'); await ready(page);
  const spaces = new Set<string>();
  let found = false;
  // Authored corpus A has a straight east route to its normally prepared treasure room.
  // This route is a test oracle; production rendering still sees only current observation.
  for (let step = 0; step <= 24; step++) {
    const current = await state(page), observation = current.observation!;
    const actor = observation.cells.find((c: any) => JSON.stringify(c.at) === JSON.stringify(observation.header.actor))!;
    spaces.add(actor.at.cell.spaceId);
    if (actor.chests.some((c: any) => !c.opened)) {
      await lookYaw(page, -Math.PI * 0.75);
      const bounds = (await canvas(page).boundingBox())!;
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.2);
      await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.2 + 260, { steps: 10 }); await page.mouse.up();
      await page.screenshot({ path: info.outputPath('chest-before.png') });
      await page.keyboard.press('e');
      await expect.poll(async () => {
        const next = (await state(page)).observation!;
        return next.cells.find((c: any) => JSON.stringify(c.at) === JSON.stringify(next.header.actor))!.chests.every((c: any) => c.opened);
      }).toBe(true);
      const opened = await state(page); await page.keyboard.press('e');
      expect((await state(page)).head.revision).toBe(opened.head.revision);
      await expect(page.getByRole('button', { name: 'Open chest', exact: true })).toBeDisabled();
      await page.screenshot({ path: info.outputPath('chest-open.png') });
      await page.reload(); await ready(page);
      expect((await state(page)).observation!.cells.find((c: any) => JSON.stringify(c.at) === JSON.stringify(opened.head.checkpoint.position))!.chests.every((c: any) => c.opened)).toBe(true);
      found = true; break;
    }
    expect(actor.edges.east, 'The authored route is currently disclosed').toBeTruthy();
    await walkOne(page, 'east');
  }
  expect(found, 'Reached and explicitly opened the ordinarily prepared corpus chest').toBe(true);
  expect(spaces.size).toBe(5);
  for (let step = 0; step < 12; step++) await walkOne(page, 'north');
  const beforeStairs = await state(page);
  expect(beforeStairs.head.checkpoint.position.level).toBe(1);
  await expect(page.getByRole('button', { name: 'Use down stairs', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('stairs.png') });
  await page.getByRole('button', { name: 'Use down stairs', exact: true }).click();
  await expect.poll(async () => (await state(page)).head.checkpoint.position.level, { timeout: 30_000 }).toBe(2);
  await ready(page);
  await page.screenshot({ path: info.outputPath('next-floor.png') });
});

test('walls, dialog cancellation and renderer recovery stop movement safely', async ({ page }, info) => {
  await page.goto('/?view=stage3d'); await ready(page);
  for (let step = 0; step < 12; step++) {
    const { observation } = await state(page), actor = observation!.cells.find((c: any) => JSON.stringify(c.at) === JSON.stringify(observation!.header.actor))!;
    const wall = Object.entries(actor.edges).find(([, target]) => target === null)?.[0];
    if (wall) {
      await turn(page, wall); const before = (await state(page)).head;
      await page.keyboard.down('w'); await page.waitForTimeout(900);
      expect((await state(page)).head.revision).toBe(before.revision);
      const stopped = xy(await canvas(page).getAttribute('data-pose')); await page.waitForTimeout(250);
      const held = xy(await canvas(page).getAttribute('data-pose'));
      // Turning has a 0.012-radian tolerance; a small tangential wall slide is valid.
      expect(Math.hypot(held[0] - stopped[0], held[1] - stopped[1])).toBeLessThan(0.02);
      expect((await state(page)).head.revision).toBe(before.revision);
      await page.keyboard.up('w'); break;
    }
    const path = route(observation, c => Object.values(c.edges).some(target => target === null));
    expect(path?.length).toBeGreaterThan(0); await walkOne(page, path![0]);
  }
  await page.getByRole('button', { name: 'Party', exact: true }).click();
  const before = (await state(page)).head; await page.keyboard.press('w');
  expect((await state(page)).head.revision).toBe(before.revision);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByLabel('3D camera', { exact: true }).selectOption('third');
  const original = await canvas(page).elementHandle();
  const supported = await canvas(page).evaluate((c: HTMLCanvasElement) => { const ext = c.getContext('webgl2')?.getExtension('WEBGL_lose_context'); ext?.loseContext(); return !!ext; });
  expect(supported).toBe(true); await expect(page.getByRole('alert')).toContainText('Graphics context lost');
  await page.keyboard.press('w'); expect((await state(page)).head.revision).toBe(before.revision);
  await page.getByRole('button', { name: 'Restart 3D', exact: true }).click(); await ready(page);
  await expect(canvas(page)).toHaveAttribute('data-camera', 'third');
  expect(await original!.evaluate(c => c.isConnected)).toBe(false);
  await page.screenshot({ path: info.outputPath('recovered-stage.png') });
});
