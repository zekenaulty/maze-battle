import type { RpgPerceptionRegion } from '../../src/domain/agentic/knowledge/perceptionTypes';
import { createPerceivedMazeView } from '../../src/viewModels/perceivedMaze';
import { drawMaze, onMazeSpritesReady, type MazeRenderMode } from '../../src/components/maze/drawMaze';
import { cameraCellSize } from '../../src/components/maze/mazeCamera';

// Begin loading the real sprites before the test's network-idle fence.
onMazeSpritesReady(() => {});

export async function paintPerception(region: RpgPerceptionRegion, width: number, height: number, mode: MazeRenderMode = 'camera', dpr = 1) {
  const view = createPerceivedMazeView(region, 'south');
  const canvas = document.querySelector('canvas') ?? document.body.appendChild(document.createElement('canvas'));
  document.body.style.margin = '0'; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawMaze(context, { width, height }, view.maze, view.chests, view.facing, 0,
    { mode, visibility: view.visibility, viewport: view.viewport });
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', pixels));
  const hash = [...digest].map(n => n.toString(16).padStart(2, '0')).join('');
  const size = mode === 'camera' ? cameraCellSize({ width, height }, view.viewport)
    : Math.min((width - 16) / view.maze.columns, (height - 16) / view.maze.rows);
  const left = Math.floor((width - size * view.maze.columns) / 2), top = Math.floor((height - size * view.maze.rows) / 2);
  const centers = Array.from({ length: region.scope.columns }, (_, column) => {
    const x = Math.floor((left + (column + 0.5) * size) * dpr), y = Math.floor((top + size / 2) * dpr);
    return [...context.getImageData(x, y, 1, 1).data];
  });
  return { hash, centers, cells: view.maze.cells.length, viewport: view.viewport,
    colors: new Set(Array.from({ length: pixels.length / 4 }, (_, i) => `${pixels[i * 4]},${pixels[i * 4 + 1]},${pixels[i * 4 + 2]}`)).size };
}
