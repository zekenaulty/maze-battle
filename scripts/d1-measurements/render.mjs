import { existsSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
const budgets = [7, 11, 13, 16, 32, 64, 128, 256];
const emit = value => console.log(JSON.stringify(value));
emit({ type: 'start', cohort: 'render', manifest: budgets.map(budget => `render-${budget}-42`) });
const start = performance.now();
const server = await createServer({ configFile: false, cacheDir: 'scripts/d1-measurements/.cache/render',
  appType: 'mpa', logLevel: 'error', server: { host: '127.0.0.1', port: 5200, strictPort: true, open: false, ws: false } });
let browser;
try {
  await server.listen();
  const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  browser = await chromium.launch({ ...(existsSync(chrome) ? { executablePath: chrome } : {}),
    headless: true, args: ['--js-flags=--max-old-space-size=768'] });
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const blocked = [];
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === 'http://127.0.0.1:5200') return route.continue();
    blocked.push(route.request().url());
    return route.abort();
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
  page.on('requestfailed', request => console.error(JSON.stringify({ url: request.url(), failure: request.failure() })));
  page.on('response', response => { if (response.status() >= 400) console.error(JSON.stringify({ url: response.url(), status: response.status() })); });
  page.on('pageerror', error => pageErrors.push(String(error)));
  const response = await page.goto('http://127.0.0.1:5200/scripts/d1-measurements/canvas.html');
  if (!response?.ok()) throw new Error(`Measurement HTML did not load: ${response?.status()}`);
  for (const budget of budgets) {
    if (performance.now() - start > 155000) {
      emit({ type: 'row', row: { id: `render-${budget}-42`, status: 'infeasible', reason: 'Cooperative wall budget exhausted' } });
      continue;
    }
    const result = await page.evaluate(async budget => {
      const { generateModuleMaze } = await import('/src/domain/maze/moduleGenerate.ts');
      const { createModuleRecipe } = await import('/src/domain/expedition/topology/modules/policy.ts');
      const { drawMaze, onMazeSpritesReady } = await import('/src/components/maze/drawMaze.ts');
      const { createMazeVisibilitySnapshot } = await import('/src/domain/maze/visibility.ts');
      const { generateChestsForMaze } = await import('/src/domain/items/chests.ts');
      const recipe = { ...createModuleRecipe('d1-measurements', 1, 42), roomBudget: budget };
      const maze = generateModuleMaze(recipe);
      const chests = generateChestsForMaze(1, maze).map(chest => chest.position);
      const canvas = document.querySelector('canvas');
      const context = canvas.getContext('2d');
      const size = { width: canvas.width, height: canvas.height };
      let callbacks = 0;
      const unsubscribe = onMazeSpritesReady(() => callbacks++);
      drawMaze(context, size, maze, chests, 'south', 0, { mode: 'camera' });
      await new Promise(resolve => setTimeout(resolve, 400));
      unsubscribe();
      const modes = [];
      for (const mode of ['camera', 'overview']) for (const fog of [true, false]) {
        const options = { mode, visibility: fog ? createMazeVisibilitySnapshot(maze) : undefined };
        for (let i = 0; i < 2; i++) drawMaze(context, size, maze, chests, 'south', i * 180, options);
        const synchronousDrawMs = [], drawPlusReadbackMs = [], visibilityMs = [];
        for (let i = 0; i < 7; i++) {
          let started = performance.now();
          createMazeVisibilitySnapshot(maze);
          visibilityMs.push(performance.now() - started);
          started = performance.now();
          drawMaze(context, size, maze, chests, 'south', i * 180, options);
          synchronousDrawMs.push(performance.now() - started);
          context.getImageData(0, 0, canvas.width, canvas.height);
          drawPlusReadbackMs.push(performance.now() - started);
        }
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let litPixels = 0;
        for (let i = 0; i < pixels.length; i += 4) if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 70) litPixels++;
        if (litPixels < 10) throw new Error('No bright renderer geometry/markers');
        modes.push({ mode, fog, synchronousDrawMs, drawPlusReadbackMs, visibilityMs, litPixels });
      }
      return { budget, seed: 42, cells: maze.cells.length, size, modes, spriteReadyCallbacks: callbacks,
        assetFailures: performance.getEntriesByType('resource').filter(entry => entry.name.includes('/assets/') && entry.responseStatus >= 400).map(entry => entry.name),
        userAgent: navigator.userAgent };
    }, budget);
    emit({ type: 'row', row: { id: `render-${budget}-42`, status: pageErrors.length || blocked.length || result.assetFailures.length ? 'error' : 'complete',
      ...result, browserVersion: browser.version(), pageErrors: [...pageErrors], blockedRequests: [...blocked] } });
  }
  await context.close();
  emit({ type: 'complete' });
} finally { await browser?.close(); await server.close(); }
