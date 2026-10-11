import { expect, test, type Locator, type Page } from '@playwright/test';
import { cameraCellSize, createMazeCamera, panMazeCamera, type MazeCameraState } from '../../src/components/maze/mazeCamera';
import type { GameState } from '../../src/domain/types';
import type {} from './resize-session-fixture';

const sizes = [
  { name: 'normal', width: 1280, height: 900 },
  { name: 'narrow', width: 320, height: 640 },
  { name: 'short-landscape', width: 844, height: 390 },
  { name: 'large', width: 1920, height: 1080 },
];

for (const deviceScaleFactor of [1, 2]) {
  test.describe(`same-session resize at DPR ${deviceScaleFactor}`, () => {
    test.use({ deviceScaleFactor, hasTouch: deviceScaleFactor === 2 });

    test('preserves manual/follow camera, overview, dialogs, movement and saves', async ({ page, context }, info) => {
      const errors: string[] = [], external: string[] = [];
      let navigations = 0;
      page.on('pageerror', error => errors.push(error.message));
      page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
      await context.route('**/*', route => {
        if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
        external.push(route.request().url());
        return route.abort();
      });
      await page.setViewportSize(sizes[0]);
      await page.goto('/tests/e2e/resize-session-fixture.html');
      await expect(page.locator('.screen-status')).toContainText('Ready');
      const session = await page.evaluate(() => window.resizeQualification.session);
      await page.getByRole('button', { name: 'Saves', exact: true }).click();
      await page.getByRole('button', { name: 'New save', exact: true }).click();
      await expect(page.getByRole('status')).toHaveText('Manual save created.');
      await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
      expect((await snapshot(page)).saves).toHaveLength(2);
      const manualSave = (await snapshot(page)).saves.find(save => save.kind === 'manual');

      let camera: MazeCameraState = { mode: 'follow', zoom: 1 };
      await expectCamera(page, camera);
      await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
      camera = { ...camera, zoom: 1.15 };
      camera = await pan(page, camera, 1, 2, deviceScaleFactor === 2);

      // Every phase resizes the existing page; no navigation, game replacement or recenter.
      for (const size of sizes) {
        await test.step(`manual camera: ${size.name}`, async () => {
          const before = await snapshot(page);
          await page.setViewportSize(size);
          await expectCanvasFits(page, deviceScaleFactor);
          await expectControls(page);
          await expectCamera(page, camera);
          expect(await snapshot(page)).toEqual(before);
          camera = await pan(page, camera, -1, -1, deviceScaleFactor === 2);
          expect(await snapshot(page)).toEqual(before);
          await movementRoundTrip(page, deviceScaleFactor === 2);
          await expectCamera(page, camera);
          await page.screenshot({ path: info.outputPath(`manual-${size.name}.png`) });
        });
      }

      const beforeOverview = await snapshot(page);
      await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
      await expectCamera(page, { ...camera, zoom: 1 });
      await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
      await expectCamera(page, camera);
      await page.getByRole('button', { name: 'Map', exact: true }).click();
      for (const size of sizes) {
        await page.setViewportSize(size);
        await expectCanvasFits(page, deviceScaleFactor);
        await expectOverview(page);
        await expect(page.getByRole('button', { name: 'Map', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByLabel('Camera controls', { exact: true })).toHaveCount(0);
        await page.screenshot({ path: info.outputPath(`overview-${size.name}.png`) });
      }
      // Overview must ignore camera gestures and restore the previously panned/zoomed view.
      await drag(page, 45, 30, deviceScaleFactor === 2);
      await page.mouse.wheel(0, -100);
      await page.getByRole('button', { name: 'Map', exact: true }).click();
      await expectCamera(page, camera);
      expect(await snapshot(page)).toEqual(beforeOverview);

      for (const [button, title] of [['Expedition settings', 'Expedition settings'], ['Saves', 'Saves']]) {
        const before = await snapshot(page);
        await page.getByRole('button', { name: button, exact: true }).click();
        const dialog = page.getByRole('dialog', { name: title, exact: true });
        for (const size of sizes) {
          await page.setViewportSize(size);
          await expectCanvasFits(page, deviceScaleFactor);
          await expectOnScreen(dialog);
          await expectOnScreen(dialog.getByRole('button', { name: 'Close dialog' }));
          const actions = title === 'Saves'
            ? [dialog.getByRole('button', { name: 'New save', exact: true }), dialog.getByRole('button', { name: 'Load', exact: true }).last()]
            : [dialog.getByRole('checkbox', { name: 'Encounters' }), dialog.getByRole('slider', { name: 'Auto throttle' }), dialog.getByRole('button', { name: 'New game', exact: true })];
          for (const action of actions) {
            await action.scrollIntoViewIfNeeded();
            await expectOnScreen(action);
          }
          await page.keyboard.press('ArrowRight');
          await expectCamera(page, camera);
          expect(await snapshot(page)).toEqual(before);
          if (size.name === 'short-landscape') await page.screenshot({ path: info.outputPath(`dialog-${title}.png`) });
        }
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await movementRoundTrip(page, deviceScaleFactor === 2);
      }

      const beforeRecenter = await snapshot(page);
      await page.getByRole('button', { name: 'Recenter camera', exact: true }).click();
      camera = { mode: 'follow', zoom: 1.15 };
      await expectCamera(page, camera);
      const canvas = page.getByLabel('Dungeon map');
      await canvas.hover({ position: { x: 30, y: 30 } });
      await page.mouse.wheel(0, -100);
      camera = { mode: 'follow', zoom: 1.27 };
      await expectCamera(page, camera);
      expect(await snapshot(page)).toEqual(beforeRecenter);

      for (const size of sizes) {
        const before = await snapshot(page);
        await page.setViewportSize(size);
        await expectCanvasFits(page, deviceScaleFactor);
        await expectControls(page);
        await expectCamera(page, camera, true);
        expect(await snapshot(page)).toEqual(before);
        await movementRoundTrip(page, deviceScaleFactor === 2, camera);
        await page.screenshot({ path: info.outputPath(`follow-${size.name}.png`) });
      }
      const start = (await gameState(page)).maze.active;
      await page.keyboard.down('ArrowRight');
      await expect.poll(async () => (await gameState(page)).maze.active).toEqual({ ...start, column: start.column + 1 });
      const whileHeld = await snapshot(page);
      await page.setViewportSize(sizes[0]);
      await expectCanvasFits(page, deviceScaleFactor);
      await expectCamera(page, camera, true);
      expect(await snapshot(page)).toEqual(whileHeld);
      await page.keyboard.up('ArrowRight');
      await page.keyboard.press('ArrowLeft');
      await expect.poll(async () => (await gameState(page)).maze.active).toEqual(start);
      await expectCamera(page, camera, true);
      expect(await page.evaluate(() => window.resizeQualification.session)).toBe(session);
      expect(navigations).toBe(1);
      expect((await snapshot(page)).saves.find(save => save.kind === 'manual')).toEqual(manualSave);
      expect(errors).toEqual([]);
      expect(external).toEqual([]);
      const final = await gameState(page);
      await info.attach('resize-qualification', { contentType: 'application/json', body: JSON.stringify({
        base: 'dc44c77', deviceScaleFactor, touch: deviceScaleFactor === 2,
        browser: context.browser()!.version(), session, navigations, viewports: sizes,
        gameId: final.id, layout: final.maze.layout?.version,
        position: final.maze.active, saves: (await snapshot(page)).saves.length,
        errors, external,
      }, null, 2) });
    });
  });
}

const snapshot = (page: Page) => page.evaluate(() => window.resizeQualification.snapshot());
const gameState = async (page: Page): Promise<GameState> => (await snapshot(page)).saves.find(save => save.slotId === 'auto')!.game;
const canvasSize = (page: Page) => page.getByLabel('Dungeon map').evaluate(element => {
  const bounds = element.getBoundingClientRect();
  return { width: Math.floor(bounds.width), height: Math.floor(bounds.height) };
});

async function expectCamera(page: Page, camera: MazeCameraState, playerVisible = false) {
  const { maze } = await gameState(page), size = await canvasSize(page);
  await expect(page.locator('.screen-status')).toContainText(`${maze.active.row + 1}, ${maze.active.column + 1}`);
  const viewport = createMazeCamera(maze, size, camera), cell = cameraCellSize(size, viewport);
  const x = Math.floor((size.width - viewport.columns * cell) / 2) + (maze.active.column - viewport.columnStart + 0.5) * cell;
  const y = Math.floor((size.height - viewport.rows * cell) / 2) + (maze.active.row - viewport.rowStart + 0.92) * cell;
  await expect.poll(() => page.evaluate(() => window.resizeQualification.paint.player)).toEqual({ x: Math.round(x), y: Math.round(y), mode: 'camera' });
  await expect(page.getByLabel(`Camera zoom ${Math.round(camera.zoom * 100)}%`)).toBeVisible();
  if (playerVisible) {
    expect(x).toBeGreaterThan(0); expect(x).toBeLessThan(size.width);
    expect(y).toBeGreaterThan(0); expect(y).toBeLessThan(size.height);
  }
}

async function expectOverview(page: Page) {
  const { maze } = await gameState(page), size = await canvasSize(page);
  const cell = Math.min((size.width - 16) / maze.columns, (size.height - 16) / maze.rows);
  const x = Math.floor((size.width - cell * maze.columns) / 2) + (maze.active.column + 0.5) * cell;
  const y = Math.floor((size.height - cell * maze.rows) / 2) + (maze.active.row + 0.5) * cell;
  await expect.poll(async () => {
    const player = await page.evaluate(() => window.resizeQualification.paint.player);
    return player?.mode === 'overview' && Math.abs(player.x - x) < 0.01 && Math.abs(player.y - y) < 0.01;
  }).toBe(true);
}

async function pan(page: Page, camera: MazeCameraState, rows: number, columns: number, touch: boolean) {
  await expectCamera(page, camera);
  const { maze } = await gameState(page), size = await canvasSize(page);
  const cell = cameraCellSize(size, createMazeCamera(maze, size, camera));
  const next = panMazeCamera(maze, size, camera, rows, columns);
  await drag(page, -columns * cell, -rows * cell, touch);
  await expectCamera(page, next);
  return next;
}

async function drag(page: Page, dx: number, dy: number, touch: boolean) {
  const bounds = (await page.getByLabel('Dungeon map').boundingBox())!;
  const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx, y: y + dy }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally { await cdp.detach(); }
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 4 });
    await page.mouse.up();
  }
}

async function movementRoundTrip(page: Page, touch: boolean, camera?: MazeCameraState) {
  const before = await gameState(page), start = before.maze.active;
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await gameState(page)).maze.active).toEqual({ ...start, column: start.column + 1 });
  if (camera) await expectCamera(page, camera, true);
  const west = page.getByRole('button', { name: 'Move west', exact: true });
  if (touch) await west.tap();
  else if (page.viewportSize()!.width <= 700) await west.click();
  else await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await gameState(page)).maze.active).toEqual(start);
  expect((await gameState(page)).id).toBe(before.id);
}

async function expectOnScreen(locator: Locator) {
  await expect(locator).toBeVisible();
  expect(await locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
  })).toBe(true);
}

async function expectControls(page: Page) {
  const dpad = await page.evaluate(() => innerWidth <= 700 || matchMedia('(pointer: coarse)').matches);
  if (!dpad) await expect(page.getByRole('group', { name: 'Movement controls', includeHidden: true })).toBeHidden();
  const names = ['Auto', 'Waves', 'Map', 'Party', 'Saves', 'Diagnostics', 'Expedition settings', 'Zoom in', 'Zoom out', 'Recenter camera'];
  if (dpad) names.push('Move north', 'Move east', 'Move south', 'Move west');
  for (const name of names) {
    const button = page.getByRole('button', { name, exact: true });
    await expectOnScreen(button);
    expect(await button.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    })).toBe(true);
  }
}

async function expectCanvasFits(page: Page, density: number) {
  const canvas = page.getByLabel('Dungeon map');
  const measure = () => canvas.evaluate((element: HTMLCanvasElement) => {
    const rect = element.getBoundingClientRect();
    const stage = element.parentElement!.getBoundingClientRect();
    const header = document.querySelector('.screen-bar')!.getBoundingClientRect();
    const controls = document.querySelector('.controls')!.getBoundingClientRect();
    return {
      fitsStage: Math.abs(rect.width - (stage.width - 8)) <= 1 && Math.abs(rect.height - (stage.height - 8)) <= 1,
      fitsScreen: rect.top >= header.bottom && rect.bottom <= Math.min(innerHeight, controls.top) && rect.right <= innerWidth && rect.width > 100 && rect.height > 100,
      backingMatches: element.width === Math.floor(Math.floor(rect.width) * devicePixelRatio)
        && element.height === Math.floor(Math.floor(rect.height) * devicePixelRatio),
      density: devicePixelRatio,
    };
  });
  const expected = { fitsStage: true, fitsScreen: true, backingMatches: true, density };
  await expect.poll(measure).toEqual(expected);
  // Catch intrinsic-size feedback beyond the observer/animation redraw interval.
  await page.waitForTimeout(250);
  expect(await measure()).toEqual(expected);
  const pixels = await canvas.evaluate((element: HTMLCanvasElement) => {
    const pixels = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
    const colors = new Set<string>();
    let opaque = true;
    for (let index = 0; index < pixels.length; index += 256) {
      colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`);
      opaque &&= pixels[index + 3] === 255;
    }
    return { colors: colors.size, opaque };
  });
  expect(pixels.opaque).toBe(true);
  expect(pixels.colors).toBeGreaterThan(10);
}
