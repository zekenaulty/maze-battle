import type { MazeState } from '../../domain/types';
import { cameraCellSize, createMazeCamera, type MazeCameraState, type MazeViewport } from './mazeCamera';

/** Same CSS-pixel geometry as drawing; backing-store DPR never enters hit tests. */
export function mazeGridGeometry(maze: MazeState, size: { width: number; height: number }, camera: MazeCameraState, mode: 'camera' | 'overview', explicit?: MazeViewport) {
  const viewport = explicit ?? (mode === 'camera' ? createMazeCamera(maze, size, camera) : {
    rowStart: 0, columnStart: 0, rowEnd: maze.rows, columnEnd: maze.columns, rows: maze.rows, columns: maze.columns,
  });
  const cellSize = mode === 'camera' ? cameraCellSize(size, viewport)
    : Math.min((size.width - 16) / maze.columns, (size.height - 16) / maze.rows);
  return { viewport, cellSize,
    x: Math.floor((size.width - cellSize * viewport.columns) / 2),
    y: Math.floor((size.height - cellSize * viewport.rows) / 2) };
}

export function mazeTileAt(maze: MazeState, bounds: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  camera: MazeCameraState, mode: 'camera' | 'overview', clientX: number, clientY: number, viewport?: MazeViewport) {
  const size = { width: Math.floor(bounds.width), height: Math.floor(bounds.height) };
  const { viewport: area, cellSize, x, y } = mazeGridGeometry(maze, size, camera, mode, viewport);
  if (cellSize < (mode === 'camera' ? 4 : 1) || !bounds.width || !bounds.height) return undefined;
  const column = Math.floor(((clientX - bounds.left) * size.width / bounds.width - x) / cellSize);
  const row = Math.floor(((clientY - bounds.top) * size.height / bounds.height - y) / cellSize);
  if (row < 0 || column < 0 || row >= area.rows || column >= area.columns) return undefined;
  return { row: area.rowStart + row, column: area.columnStart + column };
}
