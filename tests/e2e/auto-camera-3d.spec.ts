import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { appGame } from './canonical-app-auto-kill.support';

type Accepted = { t: number; revision: number; actor: string };
type Sample = { t: number; canvas: number; actor: string; revision: number; x: number; z: number; height: number;
  center: number[]; yaw: number; pitch: number; queue: number; follow: boolean; moving: boolean };
interface Capture { committed: Accepted[]; samples: Sample[]; active: boolean; overflow: boolean }
declare global { interface Window { autoCameraCapture: Capture } }
const stage = (page: Page) => page.getByLabel('Explorable 3D dungeon', { exact: true });
const angle = (n: number) => Math.atan2(Math.sin(n), Math.cos(n));
const key = (at: { level: number; cell: { spaceId: string; row: number; column: number } }) => JSON.stringify([at.level, at.cell.spaceId, at.cell.row, at.cell.column]);

test.afterEach(async ({ page }, info) => {
  const capture = await page.evaluate(() => {
    if (!window.autoCameraCapture) return undefined;
    window.autoCameraCapture.active = false; return window.autoCameraCapture;
  }).catch(() => undefined);
  if (capture) await writeFile(info.outputPath('auto-camera-capture.json'), JSON.stringify(capture));
});

// Passive transaction-complete observation. No command, RNG, clock, party or scheduler substitutions.
async function installCapture(page: Page) {
  await page.addInitScript(() => {
    if (location.origin !== 'http://127.0.0.1:5210') return;
    const capture: Capture = window.autoCameraCapture = { committed: [], samples: [], active: false, overflow: false };
    for (const method of ['put', 'add'] as const) {
      const original = IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method] = function(...args: Parameters<typeof original>) {
        const result = Reflect.apply(original, this, args);
        if (this.transaction.db.name === 'maze-battle' && this.name === 'heads') {
          const h = structuredClone(args[0]);
          if (typeof h?.revision === 'number' && h.checkpoint?.position) this.transaction.addEventListener('complete', () => {
            if (capture.committed.length >= 2048) { capture.overflow = true; return; }
            const p = h.checkpoint.position;
            capture.committed.push({ t: performance.now(), revision: h.revision, actor: JSON.stringify([p.level, p.cell.spaceId, p.cell.row, p.cell.column]) });
          }, { once: true });
        }
        return result;
      };
    }
  });
}
async function ready(page: Page) {
  await installCapture(page); await page.goto('/tests/e2e/canonical-stairs.html?view=stage3d');
  await expect(stage(page)).toHaveAttribute('data-textures', 'ready', { timeout: 60_000 });
  await expect.poll(async () => (await appGame(page)).spatial?.prepareDown, { timeout: 60_000 }).toBe(false);
  const game = await appGame(page); expect(game.randomBattles).toBe(false); expect(game.autoThrottleMs).toBe(500);
  await expect(stage(page)).toHaveAttribute('data-auto-queue', /^\d+$/);
  return game;
}
async function probe(page: Page) {
  await page.evaluate(() => {
    const capture = window.autoCameraCapture; capture.active = true;
    const ids = new WeakMap<HTMLCanvasElement, number>(); let nextId = 0;
    const tick = (t: number) => {
      if (!capture.active) return;
      const c = document.querySelector<HTMLCanvasElement>('[aria-label="Explorable 3D dungeon"]');
      if (c) {
        if (!ids.has(c)) ids.set(c, ++nextId);
        const [x, z] = (c.dataset.pose ?? '').split(',').map(Number);
        if (capture.samples.length >= 8000) capture.overflow = true;
        else capture.samples.push({ t, canvas: ids.get(c)!, actor: c.dataset.actor!, revision: Number(c.dataset.revision),
          x, z, height: Number(c.dataset.height), center: (c.dataset.center ?? '').split(',').map(Number),
          yaw: Number(c.dataset.yaw), pitch: Number(c.dataset.pitch), queue: Number(c.dataset.autoQueue),
          follow: c.dataset.autoFollow === 'true', moving: c.dataset.moving === 'true' });
      }
      requestAnimationFrame(tick);
    }; requestAnimationFrame(tick);
  });
}
async function progress(page: Page) {
  return page.evaluate(() => {
    const accepted: typeof window.autoCameraCapture.samples = [];
    for (const s of window.autoCameraCapture.samples) if (s.follow && (!accepted.length || accepted.at(-1)!.actor !== s.actor)) accepted.push(s);
    const headings: number[] = [];
    for (let i = 1; i < accepted.length; i++) {
      const a = accepted[i - 1], b = accepted[i], dx = b.center[0] - a.center[0], dz = b.center[1] - a.center[1];
      if (a.canvas === b.canvas && JSON.parse(a.actor)[0] === JSON.parse(b.actor)[0] && Math.abs(Math.hypot(dx, dz) - 3.2) < .01)
        headings.push(Math.round(Math.atan2(-dx, -dz) / (Math.PI / 2)));
    }
    return { moves: headings.length, headings: new Set(headings).size, turns: headings.slice(1).filter((h, i) => h !== headings[i]).length };
  });
}
async function stop(page: Page) {
  await page.getByRole('button', { name: 'Stop Auto', exact: true }).click();
  await expect.poll(async () => (await appGame(page)).mode).toBe('manual');
  await expect(stage(page)).toHaveAttribute('data-auto-follow', 'false');
  await expect(stage(page)).toHaveAttribute('data-auto-queue', '0');
  await expect.poll(async () => stage(page).evaluate(c => {
    const p = (c as HTMLCanvasElement).dataset, [x, z] = p.pose!.split(',').map(Number), [cx, cz] = p.center!.split(',').map(Number);
    return Math.hypot(x - cx, z - cz);
  })).toBeLessThan(.02);
}

test('default Auto interpolates accepted routes, follows several turns, then releases the camera and manual input', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await ready(page); await probe(page); await page.getByRole('button', { name: 'Auto', exact: true }).click();
  await expect(stage(page)).toHaveAttribute('data-auto-follow', 'true');
  await expect.poll(async () => { const p = await progress(page); return p.moves >= 24 && p.headings >= 3 && p.turns >= 4; },
    { timeout: 85_000, intervals: [250] }).toBe(true);
  await page.screenshot({ path: info.outputPath('auto-accepted-route-follow.png') });
  await stop(page);
  const game = await appGame(page), capture = await page.evaluate(() => { window.autoCameraCapture.active = false; return window.autoCameraCapture; });
  await writeFile(info.outputPath('auto-camera-samples.json'), JSON.stringify(capture));
  expect(capture.overflow).toBe(false); expect(game.randomBattles).toBe(false); expect(game.autoThrottleMs).toBe(500);
  const active = capture.samples.filter(s => s.follow), publications = active.filter((s, i) => !i || active[i - 1].revision !== s.revision);
  for (const s of publications) expect(capture.committed.find(h => h.revision === s.revision)?.actor).toBe(s.actor);
  const frames = active.slice(1).flatMap((s, i) => {
    const a = active[i]; if (s.canvas !== a.canvas || JSON.parse(s.actor)[0] !== JSON.parse(a.actor)[0]) return [];
    return [{ s, a, ms: s.t - a.t, distance: Math.hypot(s.x - a.x, s.z - a.z), turn: angle(s.yaw - a.yaw) }];
  });
  let waiting = 0, longestQueuedStop = 0, emptyWaiting = 0, longestEmptyQueueStop = 0, everMoved = false;
  const runs: Array<{ heading: number; distance: number; minError: number; finalError: number; ms: number }> = [];
  for (const f of frames) {
    const advancing = f.distance > .0001; everMoved ||= advancing;
    waiting = everMoved && !advancing && f.s.queue > 0 && f.a.queue > 0 ? waiting + f.ms : 0;
    longestQueuedStop = Math.max(longestQueuedStop, waiting);
    emptyWaiting = everMoved && !advancing && f.s.queue === 0 && f.a.queue === 0 ? emptyWaiting + f.ms : 0;
    longestEmptyQueueStop = Math.max(longestEmptyQueueStop, emptyWaiting);
    if (!advancing) continue;
    const heading = Math.round(Math.atan2(-(f.s.x - f.a.x), -(f.s.z - f.a.z)) / (Math.PI / 2)) * Math.PI / 2;
    const error = Math.abs(angle(f.s.yaw - heading)), prior = runs.at(-1);
    if (prior && Math.abs(angle(prior.heading - heading)) < .01) {
      prior.distance += f.distance; prior.ms += f.ms; prior.minError = Math.min(prior.minError, error); prior.finalError = error;
    } else runs.push({ heading, distance: f.distance, minError: error, finalError: error, ms: f.ms });
  }
  const moving = frames.filter(f => f.distance > .0001), aligned = runs.filter(r => r.distance > 1.6 && r.minError < .18);
  const summary = { accepted: await progress(page), frames: frames.length, interpolatedFrames: moving.length,
    maxPlanarAdvance: Math.max(...moving.map(f => f.distance)), maxQueue: Math.max(...active.map(s => s.queue)),
    longestQueuedStopMs: longestQueuedStop, longestEmptyQueueWaitMs: longestEmptyQueueStop,
    maxHeadingRate: Math.max(...frames.map(f => Math.abs(f.turn) / (f.ms / 1000))), runs };
  await writeFile(info.outputPath('auto-camera-summary.json'), JSON.stringify(summary, null, 2));
  expect(summary.maxQueue).toBeLessThanOrEqual(8); expect(summary.longestQueuedStopMs).toBeLessThan(100);
  expect(summary.maxPlanarAdvance).toBeLessThan(1); expect(moving.length).toBeGreaterThan(24 * 4);
  expect(active.filter(s => s.moving).length).toBeGreaterThan(24 * 4);
  expect(summary.maxHeadingRate).toBeLessThan(Math.PI + .4);
  expect(new Set(aligned.map(r => Math.round(r.heading / (Math.PI / 2)))).size).toBeGreaterThanOrEqual(3);
  expect(active.every(s => [s.x, s.z, s.height, s.yaw, s.pitch].every(Number.isFinite))).toBe(true);

  const paused = await appGame(page), initialYaw = Number(await stage(page).getAttribute('data-yaw')), initialPitch = Number(await stage(page).getAttribute('data-pitch'));
  const area = (await stage(page).boundingBox())!;
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2); await page.mouse.down();
  await page.mouse.move(area.x + area.width / 2 + 120, area.y + area.height / 2 + 40, { steps: 4 }); await page.mouse.up();
  expect(Math.abs(angle(Number(await stage(page).getAttribute('data-yaw')) - initialYaw))).toBeGreaterThan(.2);
  expect(Math.abs(Number(await stage(page).getAttribute('data-pitch')) - initialPitch)).toBeGreaterThan(.07);
  const pose = (await stage(page).getAttribute('data-pose'))!.split(',').map(Number);
  await page.keyboard.down('w'); await page.waitForTimeout(150); await page.keyboard.up('w');
  const after = (await stage(page).getAttribute('data-pose'))!.split(',').map(Number);
  expect(Math.hypot(after[0] - pose[0], after[1] - pose[1])).toBeGreaterThan(.2);
  expect((await appGame(page)).snapshot).toEqual(paused.snapshot); expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('auto-stopped-manual-camera.png') });
});

test('actual Auto safely remounts its 3D presentation after switching through the 2D view', async ({ page }, info) => {
  await ready(page); await probe(page); const first = await stage(page).elementHandle();
  await page.getByRole('button', { name: 'Auto', exact: true }).click();
  await expect.poll(async () => (await progress(page)).moves, { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
  await page.getByRole('button', { name: '2D view', exact: true }).click();
  await expect(stage(page)).toHaveCount(0); await expect(page.getByLabel('Dungeon map', { exact: true })).toBeVisible();
  expect(await first!.evaluate(c => c.isConnected)).toBe(false);
  const before = await appGame(page);
  await page.getByRole('button', { name: '3D view', exact: true }).click();
  await expect(stage(page)).toHaveCount(1); await expect(stage(page)).toHaveAttribute('data-auto-follow', 'true');
  await expect.poll(async () => key((await appGame(page)).checkpoint.position), { timeout: 12_000, intervals: [100] }).not.toBe(key(before.checkpoint.position));
  await expect.poll(async () => Number(await stage(page).getAttribute('data-auto-queue'))).toBeLessThanOrEqual(8);
  await stop(page); const settled = await appGame(page);
  await page.waitForTimeout(700); expect((await appGame(page)).snapshot).toEqual(settled.snapshot);
  const capture = await page.evaluate(() => { window.autoCameraCapture.active = false; return window.autoCameraCapture; });
  expect(new Set(capture.samples.map(s => s.canvas)).size).toBe(2); expect(capture.overflow).toBe(false);
  await writeFile(info.outputPath('auto-remount-samples.json'), JSON.stringify(capture));
  await page.screenshot({ path: info.outputPath('auto-remounted-stopped.png') });
});
