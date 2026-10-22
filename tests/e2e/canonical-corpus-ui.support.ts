import { createHash } from 'node:crypto';
import { expect, type Browser, type Page, type TestInfo } from '@playwright/test';
import { installCorpusControl } from './canonical-corpus.control';
import { installCorpusUiProbe } from './canonical-corpus-ui.probe';
import { CORPUS_TIME, type CorpusVariant } from './canonical-corpus.layout';
import type {} from './canonical-corpus-ui.entry';

export const ORIGIN = 'http://127.0.0.1:5446';
export const FIXTURE = `${ORIGIN}/tests/e2e/canonical-corpus-ui.html`;
export const sha256 = (value: Buffer) => createHash('sha256').update(value).digest('hex');
export async function json(info: TestInfo, name: string, value: unknown) {
  await info.attach(name, { body: JSON.stringify(value, null, 2), contentType: 'application/json' });
}
export async function openCorpusUi(browser: Browser, variant: CorpusVariant, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC', serviceWorkers: 'block' });
  const page = await context.newPage(), external: string[] = [], errors: string[] = [], failures: string[] = [];
  const images: { url: string; status: number }[] = [], blockedDevelopmentSockets: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => failures.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('response', response => {
    if (response.request().resourceType() === 'image') images.push({ url: response.url(), status: response.status() });
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === ORIGIN && !url.pathname.startsWith('/api/')) return route.continue();
    external.push(url.href); return route.abort();
  });
  await context.routeWebSocket('**/*', socket => {
    const url = new URL(socket.url());
    const development = url.origin === 'ws://127.0.0.1:5446' && url.pathname === '/' && [...url.searchParams.keys()].join() === 'token';
    (development ? blockedDevelopmentSockets : external).push(url.href);
    socket.close();
  });
  // Same one-document stream in A and B, installed before genesis or App imports.
  await context.addInitScript(installCorpusControl);
  await context.addInitScript(installCorpusUiProbe);
  await page.clock.setFixedTime(CORPUS_TIME);
  try {
    await page.goto(FIXTURE);
    await page.waitForFunction(() => !!window.corpusUi);
    const genesis = await page.evaluate(value => window.corpusUi.boot(value), variant);
    await readyCanvas(page);
    await expect.poll(() => images.length, { message: 'All 12 player frames and chest sprite load' }).toBe(13);
    await page.waitForLoadState('networkidle');
    expect(images.every(image => image.status === 200)).toBe(true);
    return { page, genesis, images, async close(info: TestInfo) {
      try {
        await json(info, `${variant}-network`, { external, blockedDevelopmentSockets, errors, failures, images });
        expect.soft(external, 'No external/API/application WebSocket traffic').toEqual([]);
        expect.soft(blockedDevelopmentSockets.length, 'Vite client and its one fallback are blocked').toBeLessThanOrEqual(2);
        expect.soft(errors, 'No hidden browser errors').toEqual([]);
        expect.soft(failures, 'All local resources loaded').toEqual([]);
      } finally { await page.evaluate(() => window.corpusUi.stop()).catch(() => {}); await context.close(); }
    } };
  } catch (error) { await context.close(); throw error; }
}
export async function readyCanvas(page: Page) {
  await expect(page.getByRole('button', { name: 'Map', exact: true })).toBeEnabled();
  await page.waitForFunction(() => {
    const view = globalThis.__corpusUiSession?.view, render = globalThis.__corpusUiCanvas;
    if (!view?.controlled || view.busy || view.recoveryRequired || !view.game?.observation || !render || render.pending) return false;
    const { generation, gameId, revision, roots } = view.game.snapshot;
    const canvas = document.querySelector<HTMLCanvasElement>('canvas.maze-canvas');
    return canvas?.getAttribute('aria-busy') !== 'true' && canvas?.dataset.frame === render.frameKey
      && render.frameKey?.startsWith(`${generation}:${gameId}:${revision}:${roots.knowledge}:`);
  });
  await expect(page.getByRole('alert')).toHaveCount(0);
}
export async function moveEast(page: Page, step: number) {
  await page.clock.setFixedTime(Date.parse(CORPUS_TIME) + step * 1000);
  const before = await page.evaluate(() => window.corpusUi.state());
  const game = before.game!, cell = game.observation!.cells.find(c => JSON.stringify(c.at) === JSON.stringify(game.checkpoint.position));
  expect(cell?.edges.east, 'Input is an already earned, open east edge').toBeTruthy();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => window.corpusUi.state().game!.snapshot.revision)).toBe(game.snapshot.revision + 1);
  await readyCanvas(page);
  const after = await page.evaluate(() => window.corpusUi.state());
  expect(after.game!.checkpoint.position).toEqual(cell!.edges.east);
  expect(after.game!.checkpoint.knowledge!.sequence).toBe(step + 1);
}
export async function captureUi(page: Page, info: TestInfo, name: string, kind: 'dungeon' | 'rooms' | 'nearby') {
  await page.mouse.move(0, 0);
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(requestAnimationFrame); });
  // Date is fixed, timers/RAF remain real. Require actual unmasked output to settle, not an overridden renderer.
  let previous = '', stable = '';
  await expect.poll(async () => {
    const hash = sha256(await page.screenshot({ fullPage: true }));
    const same = hash === previous; previous = hash; if (same) stable = hash; return same;
  }, { timeout: 10_000, intervals: [200, 250, 300] }).toBe(true);
  const semantic = await page.evaluate(value => window.corpusUi.capture(value), kind);
  const path = info.outputPath(`${name}.png`), screenshot = await page.screenshot({ path, fullPage: true });
  await info.attach(`${name}.png`, { path, contentType: 'image/png' });
  await json(info, `${name}.json`, semantic);
  expect(sha256(screenshot), 'Capture remains at its observed idle pixels').toBe(stable);
  if (semantic.pixels) expect(semantic.pixels.colors, 'Nonblank actual canvas').toBeGreaterThan(20);
  return { semantic, screenshotHash: sha256(screenshot) };
}
export async function surfaces(page: Page, info: TestInfo, name: string) {
  await readyCanvas(page);
  await page.evaluate(() => window.corpusUi.beginUiAudit());
  const dungeon = await captureUi(page, info, `${name}-dungeon`, 'dungeon');
  expect(dungeon.semantic.render.mode).toBe('camera');
  expect(dungeon.semantic.render.camera.mode).toBe('follow');
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Rooms', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.waitForFunction(() => {
    const rooms = globalThis.__corpusUiRooms;
    return rooms?.page && !rooms.busy && !rooms.error && JSON.stringify(rooms.snapshot) === JSON.stringify(globalThis.__corpusUiSession?.view.game?.snapshot);
  });
  await expect(page.getByRole('group', { name: 'Earned room map' })).toBeVisible();
  const rooms = await captureUi(page, info, `${name}-rooms`, 'rooms');
  expect(rooms.semantic.render.page.items.length).toBeGreaterThan(0);
  expect(rooms.semantic.render.page.items.every((node: { kind: string }) => node.kind === 'room')).toBe(true);
  await page.getByRole('tab', { name: 'Nearby', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Nearby', exact: true })).toHaveAttribute('aria-selected', 'true');
  await readyCanvas(page);
  const nearby = await captureUi(page, info, `${name}-nearby`, 'nearby');
  expect(nearby.semantic.render.mode).toBe('overview');
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await readyCanvas(page);
  const audit = await page.evaluate(() => window.corpusUi.endUiAudit());
  await json(info, `${name}-read-only-audit`, audit);
  expect(rooms.semantic.state).toEqual(dungeon.semantic.state);
  expect(nearby.semantic.state).toEqual(dungeon.semantic.state);
  return { dungeon, rooms, nearby, audit };
}
