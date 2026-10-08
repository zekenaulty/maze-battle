import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const label = process.argv[2] ?? 'current';
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error('Use a simple evidence label.');
const output = path.join(root, 'test-results', 'topology', label);
const seed = 20261008;
const rows = 31;
const columns = 37;
const snapshot = process.argv[3] ? JSON.parse(await readFile(path.resolve(root, process.argv[3]), 'utf8')) : undefined;
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
try {
  await server.listen();
  const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  browser = await chromium.launch(existsSync(chrome) ? { executablePath: chrome } : {});
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(server.resolvedUrls.local[0]);
  const maze = snapshot ?? await page.evaluate(async ({ seed, rows, columns }) => {
    const { generateStructuredMaze } = await import('/src/domain/maze/structuredGenerate.ts');
    let state = seed;
    const rng = () => {
      let value = state += 0x6d2b79f5;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
    return generateStructuredMaze(rows, columns, rng);
  }, { seed, rows, columns });
  await writeFile(path.join(output, 'topology.json'), JSON.stringify(maze, null, 2));
  const captures = ['overview', 'camera'].flatMap(mode => [false, true].map(fog => ({
    mode, fog, width: 1100, height: 900, name: `${mode}-${fog ? 'fog' : 'revealed'}`,
  })));
  captures.push({ mode: 'camera', fog: true, width: 390, height: 680, name: 'mobile-camera-fog' });
  for (const { mode, fog, width, height, name } of captures) {
    await page.setViewportSize({ width, height });
    await page.evaluate(async ({ maze, mode, fog, width, height }) => {
      const { drawMaze, onMazeSpritesReady } = await import('/src/components/maze/drawMaze.ts');
      const { createMazeVisibilitySnapshot } = await import('/src/domain/maze/visibility.ts');
      document.body.innerHTML = '<canvas></canvas>';
      document.body.style.margin = '0';
      const canvas = document.querySelector('canvas');
      canvas.width = width;
      canvas.height = height;
      const draw = () => drawMaze(canvas.getContext('2d'), { width, height }, maze, [], 'south', 0, {
        mode, visibility: fog ? createMazeVisibilitySnapshot(maze) : undefined,
      });
      onMazeSpritesReady(draw);
      draw();
      await Promise.all(Array.from(document.images).map(image => image.decode().catch(() => {})));
      await new Promise(resolve => setTimeout(resolve, 350));
      draw();
    }, { maze, mode, fog, width, height });
    const stats = await page.locator('canvas').evaluate(canvas => {
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const colors = new Set();
      for (let i = 0; i < pixels.length; i += 4) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
      return { colors: colors.size };
    });
    if (stats.colors < 8) throw new Error('Blank or incomplete diagnostic canvas.');
    await page.locator('canvas').screenshot({ path: path.join(output, `${name}.png`) });
  }
  const rooms = maze.layout.rooms;
  const overlaps = rooms.flatMap((a, i) => rooms.slice(i + 1).filter(b =>
    a.row < b.row + b.rows && b.row < a.row + a.rows &&
    a.column < b.column + b.columns && b.column < a.column + a.columns,
  ).map(b => [a.id, b.id]));
  const summary = {
    label, seed: snapshot ? null : seed, rows: maze.rows, columns: maze.columns,
    snapshot: process.argv[3], head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    version: maze.layout.version, rooms: rooms.length, overlaps,
    linkedCells: maze.cells.filter(cell => cell.links.length > 0).length,
    connections: maze.layout.connections?.length ?? 0,
  };
  await writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ output, ...summary }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
