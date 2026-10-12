import type { GridPosition } from '../domain/types';
import type { RpgPerceptionScope } from '../domain/agentic/knowledge/perceptionTypes';
import { createMazeCamera, type MazeCameraState } from '../components/maze/mazeCamera';

/** Camera size is display policy. Hidden world dimensions never select its extent. */
export function perceptionScope(floor: number, actor: GridPosition, size: { width: number; height: number },
  camera: MazeCameraState, mode: 'camera' | 'overview'): RpgPerceptionScope {
  const viewport = createMazeCamera({ rows: Number.MAX_SAFE_INTEGER, columns: Number.MAX_SAFE_INTEGER,
    active: actor }, size, camera);
  const rows = mode === 'overview' ? Math.min(32, viewport.rows * 2 + 1) : viewport.rows;
  const columns = mode === 'overview' ? Math.min(32, viewport.columns * 2 + 1) : viewport.columns;
  const origin = camera.mode === 'manual' && camera.origin ? camera.origin
    : { row: Math.floor(actor.row / rows) * rows, column: Math.floor(actor.column / columns) * columns };
  return { floor, rows, columns, row: Math.max(0, Math.min(Number.MAX_SAFE_INTEGER - rows, origin.row)),
    column: Math.max(0, Math.min(Number.MAX_SAFE_INTEGER - columns, origin.column)) };
}
