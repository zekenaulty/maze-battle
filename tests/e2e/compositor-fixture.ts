import { drawMaze, onMazeSpritesReady, type MazeRenderMode } from '../../src/components/maze/drawMaze';
import { cameraCellSize, createMazeCamera } from '../../src/components/maze/mazeCamera';
import { isMazeFloorCell } from '../../src/components/maze/mazeFloor';
import { cellKey } from '../../src/domain/maze/key';
import { createMazeVisibilitySnapshot, type MazeVisibilitySnapshot } from '../../src/domain/maze/visibility';
import { generateModuleMaze } from '../../src/domain/maze/moduleGenerate';
import { createModuleRecipe } from '../../src/domain/expedition/topology/modules/policy';
import type { Direction, MazeLayoutVersion, MazeState } from '../../src/domain/types';

export type FixtureVersion = MazeLayoutVersion | 'classic';
export interface FixtureOptions {
  version: FixtureVersion;
  mode: MazeRenderMode;
  zoom?: number;
  origin?: { row: number; column: number };
}

const base = [4, 8, 20];
const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
onMazeSpritesReady(() => undefined);

function makeMaze(version: FixtureVersion): MazeState {
  const maze: MazeState = {
    rows: 12, columns: 12,
    start: { row: 1, column: 1 }, end: { row: 10, column: 10 },
    active: { row: 2, column: 1 }, visited: [{ row: 1, column: 1 }],
    cells: Array.from({ length: 144 }, (_, index) => ({ row: Math.floor(index / 12), column: index % 12, links: [] })),
  };
  const link = (row: number, column: number, direction: 'east' | 'south') => {
    const neighbor = direction === 'east' ? row * 12 + column + 1 : (row + 1) * 12 + column;
    maze.cells[row * 12 + column].links.push(direction);
    maze.cells[neighbor].links.push(direction === 'east' ? 'west' : 'north');
  };
  for (const rowStart of [0, 8]) for (const columnStart of [0, 8]) {
    for (let row = rowStart; row < rowStart + 4; row++) for (let column = columnStart; column < columnStart + 4; column++) {
      if (row < rowStart + 3) link(row, column, 'south');
      if (column < columnStart + 3) link(row, column, 'east');
    }
  }
  for (let row = 3; row < 8; row++) { link(row, 1, 'south'); link(row, 9, 'south'); }
  for (let column = 3; column < 8; column++) link(9, column, 'east');
  if (version !== 'classic') {
    maze.layout = {
      version, zones: [], mainPath: [{ row: 1, column: 9 }, { row: 2, column: 9 }],
      rooms: [{ id: 'hidden', name: 'Hidden', kind: 'treasure', row: 0, column: 8, rows: 4, columns: 4,
        center: { row: 1, column: 9 }, tags: [] }],
    };
  }
  maze.visibility = { radius: 3, explored: maze.cells.filter(cell => cell.column < 4).map(({ row, column }) => ({ row, column })) };
  return maze;
}

function snapshot(maze: MazeState, state: 'hidden' | 'dim' | 'current' | 'mixed'): MazeVisibilitySnapshot {
  const floors = maze.cells.filter(cell => isMazeFloorCell(maze, cell));
  return {
    radius: 3,
    visible: new Set(floors.filter(cell => state === 'current' || (state === 'mixed' && cell.row < 4 && cell.column < 4)).map(cellKey)),
    explored: new Set(floors.filter(cell => state === 'current' || state === 'dim' || (state === 'mixed' && cell.column < 4)).map(cellKey)),
  };
}

function render(maze: MazeState, options: FixtureOptions, visibility?: MazeVisibilitySnapshot) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const dpr = window.devicePixelRatio;
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  const camera = { mode: 'manual' as const, zoom: options.zoom ?? 1, origin: options.origin ?? { row: 0, column: 0 } };
  const viewport = createMazeCamera(maze, { width, height }, camera);
  const cellSize = options.mode === 'overview' ? Math.min((width - 16) / maze.columns, (height - 16) / maze.rows) : cameraCellSize({ width, height }, viewport);
  const columns = options.mode === 'overview' ? maze.columns : viewport.columns;
  const rows = options.mode === 'overview' ? maze.rows : viewport.rows;
  const offsetX = Math.floor((width - columns * cellSize) / 2) - (options.mode === 'overview' ? 0 : viewport.columnStart * cellSize);
  const offsetY = Math.floor((height - rows * cellSize) / 2) - (options.mode === 'overview' ? 0 : viewport.rowStart * cellSize);
  drawMaze(context, { width, height }, maze, [{ row: 1, column: 9 }], 'south', 0, { mode: options.mode, camera, visibility });
  return { pixels: context.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height, dpr, cellSize, offsetX, offsetY };
}

type Frame = ReturnType<typeof render>;
function region(frame: Frame, x: number, y: number, width: number, height: number, visit: (offset: number) => void) {
  const left = Math.max(0, Math.ceil(x * frame.dpr));
  const top = Math.max(0, Math.ceil(y * frame.dpr));
  const right = Math.min(frame.width, Math.floor((x + width) * frame.dpr));
  const bottom = Math.min(frame.height, Math.floor((y + height) * frame.dpr));
  for (let py = top; py < bottom; py++) for (let px = left; px < right; px++) visit((py * frame.width + px) * 4);
}

function identity(maze: MazeState, visibility: MazeVisibilitySnapshot) {
  return JSON.stringify({ maze, radius: visibility.radius, visible: [...visibility.visible], explored: [...visibility.explored] });
}

function inspect(options: FixtureOptions) {
  const maze = makeMaze(options.version);
  const knowledge = snapshot(maze, 'mixed');
  const before = identity(maze, knowledge);
  const coldHidden = render(maze, options, snapshot(maze, 'hidden'));
  // Warm native rasterization for exact comparisons; hiding also checks the first frame.
  for (let warmup = 0; warmup < 8; warmup++) render(maze, options, knowledge);
  const clear = render(maze, options);
  const repeatedClear = render(maze, options);
  const current = render(maze, options, snapshot(maze, 'current'));
  const dim = render(maze, options, snapshot(maze, 'dim'));
  const hidden = render(maze, options, snapshot(maze, 'hidden'));
  const mixed = render(maze, options, knowledge);
  let coldHiddenNonBase = 0, hiddenNonBase = 0, dimMismatches = 0, currentMismatches = 0, repeatMismatches = 0;
  let dimSamples = 0, dimMaxError = 0;
  const dimExamples: unknown[] = [];
  for (let i = 0; i < clear.pixels.length; i += 4) {
    if (base.some((channel, k) => coldHidden.pixels[i + k] !== channel) || coldHidden.pixels[i + 3] !== 255) coldHiddenNonBase++;
    if (base.some((_, k) => clear.pixels[i + k] !== repeatedClear.pixels[i + k])) repeatMismatches++;
    if (base.some((channel, k) => hidden.pixels[i + k] !== channel) || hidden.pixels[i + 3] !== 255) hiddenNonBase++;
    if (base.some((_, k) => Math.abs(clear.pixels[i + k] - current.pixels[i + k]) > 1)) currentMismatches++;
    const error = Math.max(...base.map((channel, k) => Math.abs(dim.pixels[i + k] - Math.round(clear.pixels[i + k] * 0.42 + channel * 0.58))));
    if (error > 1) {
      dimMismatches++;
      if (dimExamples.length < 4) dimExamples.push({ x: i / 4 % clear.width, y: Math.floor(i / 4 / clear.width), clear: [...clear.pixels.slice(i, i + 4)], dim: [...dim.pixels.slice(i, i + 4)] });
    }
    dimMaxError = Math.max(dimMaxError, error);
    dimSamples++;
  }
  let voidSamples = 0, voidNonBase = 0, cornerSamples = 0, cornerMismatches = 0, cornerBright = 0;
  let cornerMaxError = 0;
  // The central gap has no floor or walls in structured v2/v3.
  region(mixed, mixed.offsetX + 5 * mixed.cellSize, mixed.offsetY + 5 * mixed.cellSize, 2 * mixed.cellSize, 2 * mixed.cellSize, i => {
    voidSamples++;
    if (base.some((channel, k) => mixed.pixels[i + k] !== channel)) voidNonBase++;
  });
  // Includes the exterior quadrant of the top-left joint, not only the floor.
  region(mixed, mixed.offsetX - mixed.cellSize * 0.1, mixed.offsetY - mixed.cellSize * 0.1, mixed.cellSize * 0.2, mixed.cellSize * 0.2, i => {
    cornerSamples++;
    cornerMaxError = Math.max(cornerMaxError, ...base.map((_, k) => Math.abs(mixed.pixels[i + k] - clear.pixels[i + k])));
    if (base.some((_, k) => Math.abs(mixed.pixels[i + k] - clear.pixels[i + k]) > 1)) cornerMismatches++;
    if (mixed.pixels[i] > 30) cornerBright++;
  });
  // Change only unknown topology, including branches touching a visible joint.
  const variant = structuredClone(maze);
  const add = (row: number, column: number, direction: Direction) => {
    if (!variant.cells[row * 12 + column].links.includes(direction)) variant.cells[row * 12 + column].links.push(direction);
  };
  add(4, 4, 'east'); add(4, 5, 'west'); add(4, 4, 'south'); add(5, 4, 'north');
  variant.end = { row: 9, column: 10 };
  if (variant.layout) { variant.layout.rooms[0].kind = 'boss'; variant.layout.mainPath = [{ row: 2, column: 10 }]; }
  const altered = render(variant, options, knowledge);
  let hiddenGuidanceMismatches = 0;
  for (let i = 0; i < mixed.pixels.length; i += 4) {
    if (base.some((_, k) => mixed.pixels[i + k] !== altered.pixels[i + k])) hiddenGuidanceMismatches++;
  }
  render(maze, options, knowledge);
  return { coldHiddenNonBase, hiddenNonBase, dimMismatches, currentMismatches, repeatMismatches, dimSamples, dimMaxError, dimExamples, cornerMaxError, voidSamples, voidNonBase,
    cornerSamples, cornerMismatches, cornerBright, hiddenGuidanceMismatches, knowledgeUnchanged: before === identity(maze, knowledge),
    backing: { width: canvas.width, height: canvas.height, dpr: window.devicePixelRatio }, cellSize: mixed.cellSize };
}

function show(options: FixtureOptions, state: 'hidden' | 'dim' | 'current' | 'mixed' | 'clear') {
  const maze = makeMaze(options.version);
  render(maze, options, state === 'clear' ? undefined : snapshot(maze, state));
}

function measureGenerated() {
  const maze = generateModuleMaze(createModuleRecipe('issue-5-render', 125, 42));
  const initial = createMazeVisibilitySnapshot(maze);
  const before = identity(maze, initial);
  const surface = document.createElement('canvas');
  surface.width = 900 * devicePixelRatio;
  surface.height = 740 * devicePixelRatio;
  const context = surface.getContext('2d')!;
  context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  const results = [];
  for (const mode of ['camera', 'overview'] as const) {
    for (const state of ['clear', 'initial', 'remembered'] as const) {
      const visibility = state === 'clear' ? undefined : state === 'initial' ? initial : { ...snapshot(maze, 'dim'), visible: initial.visible };
      const draws: number[] = [];
      for (let i = 0; i < 12; i++) {
        const start = performance.now();
        drawMaze(context, { width: 900, height: 740 }, maze, [], 'south', 0, { mode, visibility });
        if (i >= 3) draws.push(performance.now() - start);
      }
      const pixels = context.getImageData(0, 0, surface.width, surface.height).data;
      let nonBase = 0;
      for (let i = 0; i < pixels.length; i += 4) if (base.some((value, k) => pixels[i + k] !== value)) nonBase++;
      draws.sort((a, b) => a - b);
      results.push({ mode, state, medianMs: draws[4], minMs: draws[0], maxMs: draws[8], nonBase });
    }
  }
  return { rooms: maze.layout!.rooms.length, rows: maze.rows, columns: maze.columns, cells: maze.cells.length,
    seed: 42, dpr: devicePixelRatio, results, knowledgeUnchanged: before === identity(maze, initial) };
}

window.compositor = { inspect, show, measureGenerated };
declare global { interface Window { compositor: { inspect: typeof inspect; show: typeof show; measureGenerated: typeof measureGenerated } } }
