import type { GridPosition, MazeState } from '../../domain/types';

export interface MazeViewport {
  rowStart: number;
  rowEnd: number;
  columnStart: number;
  columnEnd: number;
  rows: number;
  columns: number;
}

export interface MazeCameraState {
  mode: 'follow' | 'manual';
  zoom: number;
  origin?: GridPosition;
}

interface CanvasSize {
  width: number;
  height: number;
}

export const DEFAULT_MAZE_CAMERA: MazeCameraState = {
  mode: 'follow',
  zoom: 1,
};

const DESKTOP_TARGET_CELL = 56;
const MOBILE_TARGET_CELL = 38;
const DESKTOP_MAX_ROWS = 17;
const DESKTOP_MAX_COLUMNS = 21;
const MOBILE_MAX_ROWS = 11;
const MOBILE_MAX_COLUMNS = 13;
const MIN_ROWS = 7;
const MIN_COLUMNS = 9;
const PADDING = 16;
const ZOOM_MIN = 0.7;
const ZOOM_MAX = 1.6;

export function createMazeCamera(maze: MazeState, size: CanvasSize, camera: MazeCameraState = DEFAULT_MAZE_CAMERA): MazeViewport {
  const isCompact = size.width < 760 || size.height < 640;
  const zoom = clampCameraZoom(camera.zoom ?? DEFAULT_MAZE_CAMERA.zoom);
  const targetCell = (isCompact ? MOBILE_TARGET_CELL : DESKTOP_TARGET_CELL) * zoom;
  const maxRows = maxVisibleCount(isCompact ? MOBILE_MAX_ROWS : DESKTOP_MAX_ROWS, MIN_ROWS, maze.rows, zoom);
  const maxColumns = maxVisibleCount(isCompact ? MOBILE_MAX_COLUMNS : DESKTOP_MAX_COLUMNS, MIN_COLUMNS, maze.columns, zoom);
  const rows = visibleCount(size.height, targetCell, MIN_ROWS, maxRows, maze.rows);
  const columns = visibleCount(size.width, targetCell, MIN_COLUMNS, maxColumns, maze.columns);
  const origin = camera.mode === 'manual' && camera.origin ? camera.origin : pageOriginFor(maze.active, rows, columns);
  const rowStart = clamp(origin.row, 0, Math.max(0, maze.rows - rows));
  const columnStart = clamp(origin.column, 0, Math.max(0, maze.columns - columns));

  return {
    rowStart,
    rowEnd: rowStart + rows,
    columnStart,
    columnEnd: columnStart + columns,
    rows,
    columns,
  };
}

export function panMazeCamera(maze: MazeState, size: CanvasSize, camera: MazeCameraState, deltaRows: number, deltaColumns: number): MazeCameraState {
  const viewport = createMazeCamera(maze, size, camera);

  return {
    ...camera,
    mode: 'manual',
    origin: clampCameraOrigin(
      maze,
      viewport,
      {
        row: viewport.rowStart + deltaRows,
        column: viewport.columnStart + deltaColumns,
      },
    ),
  };
}

export function zoomMazeCamera(camera: MazeCameraState, delta: number): MazeCameraState {
  return {
    ...camera,
    zoom: clampCameraZoom((camera.zoom ?? DEFAULT_MAZE_CAMERA.zoom) + delta),
  };
}

export function clampCameraZoom(zoom: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom * 100) / 100));
}

export function cameraCellSize(size: CanvasSize, viewport: Pick<MazeViewport, 'rows' | 'columns'>) {
  return Math.floor(Math.min((size.width - PADDING) / viewport.columns, (size.height - PADDING) / viewport.rows));
}

export function isInViewport(position: GridPosition, viewport: MazeViewport) {
  return position.row >= viewport.rowStart && position.row < viewport.rowEnd && position.column >= viewport.columnStart && position.column < viewport.columnEnd;
}

function visibleCount(availablePixels: number, targetCell: number, min: number, max: number, mapCount: number) {
  const capacity = Math.max(min, oddFloor(Math.floor((availablePixels - PADDING) / targetCell)));
  return Math.min(mapCount, Math.max(min, Math.min(max, capacity)));
}

function maxVisibleCount(baseMax: number, min: number, mapCount: number, zoom: number) {
  const scaled = oddFloor(Math.floor(baseMax / zoom));
  return Math.min(mapCount, Math.max(min, scaled));
}

function pageOriginFor(position: GridPosition, rows: number, columns: number): GridPosition {
  return {
    row: Math.floor(position.row / rows) * rows,
    column: Math.floor(position.column / columns) * columns,
  };
}

function clampCameraOrigin(maze: MazeState, viewport: MazeViewport, origin: GridPosition): GridPosition {
  return {
    row: clamp(origin.row, 0, Math.max(0, maze.rows - viewport.rows)),
    column: clamp(origin.column, 0, Math.max(0, maze.columns - viewport.columns)),
  };
}

function oddFloor(value: number) {
  if (value <= 1) {
    return 1;
  }

  return value % 2 === 0 ? value - 1 : value;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
