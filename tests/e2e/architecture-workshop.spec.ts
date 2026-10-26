import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

interface Counts { buffers: number; textures: number; programs: number }
interface PixelSample { width: number; height: number; step: number; frame: number; blend: number; elapsed: number; pixels: number[]; png: string }
declare global { interface Window { architectureGpuCounts: () => Counts; architectureNativeWrites: number } }
const canvas = (page: Page) => page.getByLabel('Model and stair workshop', { exact: true });
const next = (page: Page) => page.getByRole('button', { name: 'Next lantern frame', exact: true });
const shaderErrors = new WeakMap<Page, string[]>();
async function frames(page: Page, n = 8) { await page.evaluate(n => new Promise<void>(resolve => {
  const tick = () => { if (--n <= 0) resolve(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick);
}), n); }

test.beforeEach(async ({ page }) => {
  const errors: string[] = []; shaderErrors.set(page, errors);
  page.on('console', message => { if (message.type() === 'error' && /shader|webgl|validateprogram|compile|linkprogram/i.test(message.text())) errors.push(message.text()); });
  // Passive allocation accounting observes real GPU resources without replacing the renderer or shader.
  await page.addInitScript(() => {
    const live: Record<keyof Counts, Set<unknown>> = { buffers: new Set(), textures: new Set(), programs: new Set() };
    window.architectureGpuCounts = () => ({ buffers: live.buffers.size, textures: live.textures.size, programs: live.programs.size });
    for (const context of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const prototype = context.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
      for (const [kind, noun] of [['buffers', 'Buffer'], ['textures', 'Texture'], ['programs', 'Program']] as const) {
        const create = prototype['create' + noun], remove = prototype['delete' + noun];
        prototype['create' + noun] = function(...args: unknown[]) { const value = create.apply(this, args); if (value) live[kind].add(value); return value; };
        prototype['delete' + noun] = function(...args: unknown[]) { const result = remove.apply(this, args); live[kind].delete(args[0]); return result; };
      }
    }
    window.architectureNativeWrites = 0;
    for (const name of ['put', 'add', 'delete', 'clear'] as const) {
      const prototype = IDBObjectStore.prototype as unknown as Record<string, (...args: unknown[]) => unknown>, original = prototype[name];
      prototype[name] = function(...args: unknown[]) { window.architectureNativeWrites++; return original.apply(this, args); };
    }
  });
});
test.afterEach(async ({ page }, info) => {
  const evidence = await page.evaluate(async () => ({ gpu: window.architectureGpuCounts?.(), writes: window.architectureNativeWrites,
    databases: (await indexedDB.databases()).map(d => d.name), datasets: document.querySelector<HTMLCanvasElement>('[aria-label="Model and stair workshop"]')?.dataset })).catch(() => undefined);
  if (evidence) await writeFile(info.outputPath('workshop-final-state.json'), JSON.stringify({ ...evidence, shaderErrors: shaderErrors.get(page) ?? [] }, null, 2));
  expect(shaderErrors.get(page) ?? []).toEqual([]);
});
async function unchangedGame(page: Page) {
  expect(await page.evaluate(() => window.architectureNativeWrites)).toBe(0);
  expect(await page.evaluate(async () => (await indexedDB.databases()).map(d => d.name))).toEqual([]);
}
async function ready(page: Page) {
  await page.goto('/?view=models&exhibit=architecture');
  await expect(canvas(page)).toHaveAttribute('data-architecture-ready', 'true');
  await expect(canvas(page)).toHaveAttribute('data-architecture-meshes', '23');
  await expect(canvas(page)).toHaveAttribute('data-architecture-geometry-count', '23');
  await expect(canvas(page)).toHaveAttribute('data-architecture-animated-materials', '1');
  await expect(canvas(page)).toHaveAttribute('data-architecture-revision', /\S+/);
  await expect(canvas(page)).toHaveAttribute('data-lantern-textures', '3');
  await expect(canvas(page)).toHaveAttribute('data-ready', 'ready');
  await expect(page.locator('canvas')).toHaveCount(1);
}
async function seekStep(page: Page, target: number) {
  await page.getByLabel('Animate lantern', { exact: true }).uncheck();
  for (let i = 0; i < 4; i++) {
    const current = Number(await canvas(page).getAttribute('data-lantern-step'));
    if (current === target && Number(await canvas(page).getAttribute('data-lantern-blend')) === 0) break;
    await next(page).click(); await expect(canvas(page)).toHaveAttribute('data-lantern-step', String((current + 1) % 4));
  }
  await expect(canvas(page)).toHaveAttribute('data-lantern-step', String(target));
  await expect(canvas(page)).toHaveAttribute('data-lantern-blend', '0.0000'); await frames(page);
}
async function pixels(page: Page, at?: { step: number; lo: number; hi: number }): Promise<PixelSample> {
  return page.evaluate(at => new Promise<PixelSample>((resolve, reject) => {
    const deadline = performance.now() + 5000;
    const sample = () => {
      const c = document.querySelector<HTMLCanvasElement>('[aria-label="Model and stair workshop"]')!, step = Number(c.dataset.lanternStep), blend = Number(c.dataset.lanternBlend);
      if (at && (step !== at.step || blend < at.lo || blend > at.hi)) {
        if (performance.now() > deadline) return reject(Error('No requested interpolation sample within five seconds'));
        requestAnimationFrame(sample); return;
      }
      const gl = c.getContext('webgl2')!;
      const width = Math.min(512, c.width), height = Math.min(512, c.height), data = new Uint8Array(width * height * 4);
      gl.readPixels(Math.floor((c.width - width) / 2), Math.floor((c.height - height) / 2), width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
      resolve({ width, height, step, frame: Number(c.dataset.lanternFrame), blend, elapsed: Number(c.dataset.lanternElapsed), pixels: [...data], png: c.toDataURL('image/png') });
    }; requestAnimationFrame(sample);
  }), at);
}
function difference(a: PixelSample, b: PixelSample) {
  expect([a.width, a.height]).toEqual([b.width, b.height]); let changed = 0, total = 0;
  for (let i = 0; i < a.pixels.length; i += 4) {
    const d = [0, 1, 2].map(c => Math.abs(a.pixels[i + c] - b.pixels[i + c]));
    total += d.reduce((sum, v) => sum + v, 0); if (Math.max(...d) >= 2) changed++;
  }
  return { changedPixels: changed, meanRgbDifference: total / (a.width * a.height * 3) };
}
async function image(info: TestInfo, name: string, sample: PixelSample) {
  await writeFile(info.outputPath(name + '.png'), Buffer.from(sample.png.split(',')[1], 'base64'));
}

test('one architecture scene exposes all inspection views and exact repeated-frame lantern timing', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await ready(page);
  await seekStep(page, 0); const node = await canvas(page).elementHandle(), timeline = [0, 1, 2, 1];
  const observed: Array<{ step: number; frame: number; elapsed: number }> = [];
  for (let i = 0; i < 9; i++) {
    const step = i % 4;
    await expect(canvas(page)).toHaveAttribute('data-lantern-step', String(step));
    await expect(canvas(page)).toHaveAttribute('data-lantern-frame', String(timeline[step]));
    await expect(canvas(page)).toHaveAttribute('data-lantern-blend', '0.0000');
    const elapsed = Number(await canvas(page).getAttribute('data-lantern-elapsed')); expect(elapsed).toBe(step * 400);
    observed.push({ step, frame: timeline[step], elapsed });
    if (i < 8) { await next(page).click(); await expect(canvas(page)).toHaveAttribute('data-lantern-step', String((step + 1) % 4)); }
  }
  for (const view of ['front', 'back', 'left', 'right']) {
    await page.getByRole('button', { name: view, exact: true }).click(); await frames(page);
    await page.screenshot({ path: info.outputPath('architecture-' + view + '.png') });
  }
  await page.getByRole('button', { name: 'front', exact: true }).click();
  await page.getByLabel('Bounds, anchors & clearances', { exact: true }).check(); await frames(page);
  await page.screenshot({ path: info.outputPath('architecture-placement-overlays.png') });
  await page.getByLabel('Bounds, anchors & clearances', { exact: true }).uncheck();
  await page.getByLabel('Wireframe', { exact: true }).check(); await frames(page);
  await page.screenshot({ path: info.outputPath('architecture-wireframe.png') });
  await page.getByLabel('Wireframe', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Lantern close-up', exact: true }).click(); await frames(page);
  await page.screenshot({ path: info.outputPath('lantern-closeup.png') });
  for (const [side, direction] of [['left', 1], ['right', -1]] as const) {
    await page.getByRole('button', { name: 'Lantern close-up', exact: true }).click(); await frames(page);
    const bounds = (await canvas(page).boundingBox())!;
    const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + direction * bounds.height / 4, y, { steps: 20 }); await page.mouse.up(); await frames(page, 35);
    await page.screenshot({ path: info.outputPath('lantern-closeup-' + side + '.png') });
  }
  await page.getByRole('button', { name: 'Lantern close-up', exact: true }).click(); await frames(page);
  await page.getByLabel('Low light', { exact: true }).check(); await frames(page);
  await page.screenshot({ path: info.outputPath('lantern-low-light.png') });
  expect(await node!.evaluate(c => c.isConnected)).toBe(true); await expect(page.locator('canvas')).toHaveCount(1);
  await writeFile(info.outputPath('paused-timeline.json'), JSON.stringify(observed, null, 2));
  await unchangedGame(page); expect(errors).toEqual([]);
});

test('GPU pixels interpolate resident keyframes and resources remain stable across loops and inspection options', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await ready(page);
  await seekStep(page, 0); await page.getByRole('button', { name: 'Lantern close-up', exact: true }).click(); await frames(page);
  const a = await pixels(page), aAgain = await pixels(page); expect(difference(a, aAgain).changedPixels).toBe(0);
  await next(page).click(); await expect(canvas(page)).toHaveAttribute('data-lantern-frame', '1'); await frames(page);
  const b = await pixels(page); await image(info, 'lantern-frame-0', a); await image(info, 'lantern-frame-1', b);
  await next(page).click(); await next(page).click(); await expect(canvas(page)).toHaveAttribute('data-lantern-step', '3'); await frames(page);
  const repeated = await pixels(page); expect(difference(b, repeated).changedPixels).toBe(0);
  await seekStep(page, 0); await page.getByLabel('Animate lantern', { exact: true }).check();
  const middle = await pixels(page, { step: 0, lo: .4, hi: .6 });
  await page.getByLabel('Animate lantern', { exact: true }).uncheck(); await image(info, 'lantern-interpolated-midpoint', middle);
  const comparisons = { keyframes: difference(a, b), midpointFromFirst: difference(a, middle), midpointFromSecond: difference(b, middle),
    blend: middle.blend, step: middle.step, frame: middle.frame };
  for (const diff of [comparisons.keyframes, comparisons.midpointFromFirst, comparisons.midpointFromSecond]) expect(diff.changedPixels).toBeGreaterThan(20);
  // Warm lazy wireframe/overlay buffers before measuring repeated operation, not their first allocation.
  for (const label of ['Bounds, anchors & clearances', 'Wireframe', 'Low light']) {
    await page.getByLabel(label, { exact: true }).check(); await frames(page); await page.getByLabel(label, { exact: true }).uncheck();
  }
  await seekStep(page, 0); await frames(page); const baseline = await page.evaluate(() => window.architectureGpuCounts());
  const rendererCounts = () => canvas(page).evaluate(c => {
    const d = (c as HTMLCanvasElement).dataset;
    return { geometries: Number(d.gpuGeometries), textures: Number(d.gpuTextures), programs: Number(d.gpuPrograms),
      architectureGeometries: Number(d.architectureGeometryCount), animatedMaterials: Number(d.architectureAnimatedMaterials) };
  });
  const rendererBaseline = await rendererCounts(), samples: Counts[] = [], rendererSamples = [];
  await page.getByLabel('Animate lantern', { exact: true }).check();
  for (let loop = 0; loop < 4; loop++) {
    await expect.poll(async () => Number(await canvas(page).getAttribute('data-lantern-elapsed')), { timeout: 5000, intervals: [50] }).toBeGreaterThanOrEqual((loop + 1) * 1600);
    for (const label of ['Bounds, anchors & clearances', 'Wireframe', 'Low light']) await page.getByLabel(label, { exact: true }).setChecked(loop % 2 === 0);
    await frames(page); await expect(canvas(page)).toHaveAttribute('data-lantern-textures', '3');
    samples.push(await page.evaluate(() => window.architectureGpuCounts()));
    rendererSamples.push(await rendererCounts());
  }
  await page.getByLabel('Animate lantern', { exact: true }).uncheck();
  for (const counts of samples) expect(counts).toEqual(baseline);
  for (const counts of rendererSamples) expect(counts).toEqual(rendererBaseline);
  await writeFile(info.outputPath('pixel-and-resource-evidence.json'), JSON.stringify({ comparisons, baseline, samples, rendererBaseline, rendererSamples }, null, 2));
  await unchangedGame(page); expect(errors).toEqual([]);
});

test('missing lighting pack reports fallback while native exhibits and game storage remain intact', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/assets/model-packs/lighting/manifest.json', route => route.fulfill({ status: 404, body: 'Controlled missing lighting pack' }));
  await page.goto('/?view=models&exhibit=architecture');
  await expect(canvas(page)).toHaveAttribute('data-architecture-ready', 'false');
  await expect(page.getByRole('status')).toContainText('Architecture preview pack unavailable');
  await expect(canvas(page)).toHaveAttribute('data-ready', 'ready');
  await page.screenshot({ path: info.outputPath('missing-lighting-native-reference.png') });
  await page.getByLabel('Exhibit', { exact: true }).selectOption('models');
  await expect(page.getByRole('status')).toContainText('Curated TileLab textures');
  await page.getByLabel('Lever on / door open', { exact: true }).check();
  await page.getByLabel('Exhibit', { exact: true }).selectOption('stairs');
  await page.getByRole('button', { name: 'right', exact: true }).click(); await frames(page);
  await page.screenshot({ path: info.outputPath('missing-lighting-native-stairs.png') });
  await page.getByLabel('Exhibit', { exact: true }).selectOption('architecture');
  await expect(page.getByRole('status')).toContainText('Architecture preview pack unavailable');
  await expect(page.locator('canvas')).toHaveCount(1); await unchangedGame(page); expect(errors).toEqual([]);
});

test('wireframe selected before delayed PNGs finish receives the loaded animated maps', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  let release!: () => void, requested = 0;
  const pendingFrames = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/assets/model-packs/lighting/textures/*.png', async route => {
    requested++; await pendingFrames; await route.continue();
  });
  try {
    await page.goto('/?view=models&exhibit=architecture', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => requested).toBe(3);
    await page.getByLabel('Animate lantern', { exact: true }).uncheck();
    await page.getByLabel('Wireframe', { exact: true }).check(); await frames(page);
    await expect(canvas(page)).not.toHaveAttribute('data-architecture-ready', 'true');
    await page.screenshot({ path: info.outputPath('wireframe-frames-pending.png') });
  } finally { release(); }
  await expect(canvas(page)).toHaveAttribute('data-architecture-ready', 'true');
  await expect(canvas(page)).toHaveAttribute('data-lantern-textures', '3');
  await expect(page.getByLabel('Wireframe', { exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Lantern close-up', exact: true }).click();
  await seekStep(page, 0); const a = await pixels(page); await image(info, 'delayed-wireframe-frame-0', a);
  await next(page).click(); await expect(canvas(page)).toHaveAttribute('data-lantern-frame', '1'); await frames(page);
  const b = await pixels(page); await image(info, 'delayed-wireframe-frame-1', b);
  const comparison = difference(a, b); expect(comparison.changedPixels).toBeGreaterThan(20);
  await writeFile(info.outputPath('delayed-wireframe-evidence.json'), JSON.stringify({ requested, comparison }, null, 2));
  await unchangedGame(page); expect(errors).toEqual([]);
});
