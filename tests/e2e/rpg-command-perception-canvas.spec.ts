import { test, expect, fixture } from './rpg-command-browser';
import config from './rpg-command.config';

// Freeze the raster backend: readback can otherwise switch accelerated canvases
// to software mid-comparison and change rounding despite identical draw commands.
test.use({ launchOptions: { ...config.use?.launchOptions, args: ['--disable-accelerated-2d-canvas'] } });

for (const { name, width, height, dpr } of [
  { name: 'desktop', width: 960, height: 640, dpr: 1 },
  { name: 'mobile', width: 390, height: 640, dpr: 2.625 },
]) for (const mode of ['camera', 'overview'] as const) {
  test(`${name} ${mode}: remembered pixels stay stable until new sight and coordinate translation stays bounded`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await fixture(page);
    await page.evaluate(() => window.rpgCommandTest.preparePerceptionCanvas());
    await page.waitForLoadState('networkidle');
    const result = await page.evaluate(async ({ width, height, dpr, mode }) => {
      const h = window.rpgCommandTest, game = h.game(), scope = { floor: 1, row: 0, column: 0, rows: 3, columns: 7 };
      game.maze = { ...game.maze, active: { row: 0, column: 0 }, visibility: { radius: 3, explored: [] } };
      await h.repository.saveGame('auto', 'Pixels', 'auto', game);
      let state = await h.custody.claimGame('owner');
      state = await h.custody.updateOwnedGame(state.control, g => ({ ...g, maze: { ...g.maze, visibility: { radius: 1, explored: [] } } }));
      await h.memory.prepareRpgMemory();
      const before = await h.memory.readRpgPerceptionRegion('auto', scope);
      if (before.status !== 'ready') throw new Error('Unprepared');
      const pixels = await h.paintPerception(before.data, width, height, mode, dpr);
      state = await h.custody.updateOwnedGame(state.control, g => ({ ...g, chests: [], maze: { ...g.maze,
        rows: 10_000, columns: 10_000,
        cells: g.maze.cells.map(c => c.column === 2 ? { ...c, links: [] } : c) } }));
      const unchanged = await h.memory.readRpgPerceptionRegion('auto', scope);
      if (unchanged.status !== 'ready') throw new Error('Unprepared');
      const hiddenPixels = await h.paintPerception(unchanged.data, width, height, mode, dpr);
      const translated = structuredClone(before.data), delta = Number.MAX_SAFE_INTEGER - 64;
      const shift = (at: { row: number; column: number }) => ({ ...at, row: at.row + delta, column: at.column + delta });
      const shifted = { ...translated, actor: shift(translated.actor), scope: shift(translated.scope),
        cells: translated.cells.map(c => ({ ...c, fact: { ...c.fact, address: shift(c.fact.address),
          chests: c.fact.chests.map(chest => ({ ...chest, position: shift(chest.position) })) },
          ...(c.state === 'visible' ? { observation: { ...c.observation, address: shift(c.observation.address),
            chests: c.observation.chests.map(chest => ({ ...chest, position: shift(chest.position) })) } } : {}) })) };
      const distantPixels = await h.paintPerception(shifted, width, height, mode, dpr);
      state = await h.custody.updateOwnedGame(state.control, g => ({ ...g, maze: { ...g.maze,
        active: { row: 0, column: 2 }, visibility: { radius: 0, explored: [] } } }));
      await h.memory.prepareRpgMemory();
      const changed = await h.memory.readRpgPerceptionRegion('auto', scope);
      if (changed.status !== 'ready') throw new Error('Unprepared');
      const changedPixels = await h.paintPerception(changed.data, width, height, mode, dpr);
      // Leave the initial mixed visible/remembered frame for the evidence screenshot.
      await h.paintPerception(before.data, width, height, mode, dpr);
      return { pixels, hiddenPixels, distantPixels, changedPixels, beforeWork: before.work, afterWork: unchanged.work };
    }, { width, height, dpr, mode });
    expect(result.hiddenPixels).toEqual(result.pixels);
    expect(result.distantPixels).toEqual(result.pixels);
    expect(result.beforeWork).toEqual(result.afterWork);
    expect(result.changedPixels.hash).not.toBe(result.pixels.hash);
    expect(result.pixels.colors).toBeGreaterThan(100);
    const brightness = (rgba: number[]) => rgba.slice(0, 3).reduce((a, b) => a + b, 0);
    expect(brightness(result.pixels.centers[1])).toBeGreaterThan(brightness(result.pixels.centers[3]));
    expect(brightness(result.pixels.centers[3])).toBeGreaterThan(brightness(result.pixels.centers[4]));
    await info.attach('perception-pixel-proof', { contentType: 'application/json', body: JSON.stringify(result) });
    await page.locator('canvas').screenshot({ path: info.outputPath(`${name}-${mode}.png`) });
  });
}
