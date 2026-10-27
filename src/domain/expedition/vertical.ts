import type { GridPosition } from '../types';
import { movePosition } from '../maze/movement';
import { materializeSpace } from './schematic';
import type { SpaceGeometry, SpaceSpec } from './types';

export const STAIR_LAYOUT_VERSION = 'straight-stair-layout-v1' as const;
export const SPATIAL_CELL_SIZE = 3.2;
export const STAIR_RECIPE = Object.freeze({ id: 'straight-stair-v1' as const, width: 1.8, rise: 4.68,
  tread: .42, steps: 18, landing: 1.8, separation: 9.36 });
export type FloorFrame = [number, number, number];
export interface StairRoomLayout { version: typeof STAIR_LAYOUT_VERSION; end: 'upper' | 'lower' }
export interface StairPlacement { version: 'straight-stair-placement-v1'; recipe: typeof STAIR_RECIPE.id;
  upperFrame: FloorFrame; lowerFrame: FloorFrame }
// Millimetre precision bounds repeated transforms and serialized coordinate size.
export function validFloorFrame(value: unknown): value is FloorFrame {
  return Array.isArray(value) && value.length === 3 && value.every(n => typeof n === 'number'
    && Number.isFinite(n) && Math.abs(n) <= 1e9 && Math.abs(n * 1000 - Math.round(n * 1000)) < .001);
}
export function floorPoint(frame: FloorFrame, at: GridPosition): FloorFrame {
  return [frame[0] + at.column * SPATIAL_CELL_SIZE, frame[1], frame[2] + at.row * SPATIAL_CELL_SIZE];
}
export function stairReservedCells(spec: SpaceSpec, layout: StairRoomLayout): GridPosition[] {
  if (layout.version !== STAIR_LAYOUT_VERSION || !['upper', 'lower'].includes(layout.end)
    || spec.purpose === 'stairwell-v1' && (spec.rows !== 9 || spec.columns !== 3)
    || spec.kind !== 'room' || spec.rows < 9 || spec.columns < (spec.purpose === 'stairwell-v1' ? 3 : 9)
    || spec.rows % 2 !== 1 || spec.columns % 2 !== 1) {
    throw new Error('Incompatible stair-room layout');
  }
  const sign = layout.end === 'upper' ? -1 : 1, row = Math.floor(spec.rows / 2), column = Math.floor(spec.columns / 2);
  return [1, 2, 3].map(step => ({ row: row + sign * step, column }));
}
/** Versioned room schematic: reserve the shaft and keep a one-cell bypass beside it. */
export function materializeStairRoom(spec: SpaceSpec, layout: StairRoomLayout): SpaceGeometry {
  const reserved = stairReservedCells(spec, layout), key = (p: GridPosition) => `${p.row},${p.column}`;
  const removed = new Set(reserved.map(key)), cells = new Map(materializeSpace(spec).cells.map(c => [key(c), c]));
  for (const at of reserved) {
    cells.delete(key(at));
    for (const column of [at.column - 1, at.column + 1]) cells.set(key({ ...at, column }), { ...at, column, links: [] });
  }
  for (const cell of cells.values()) cell.links = (['north', 'east', 'south', 'west'] as const)
    .filter(d => cells.has(key(movePosition(cell, d))));
  const reached = new Set<string>(), queue = [cells.values().next().value!];
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i], id = key(cell); if (reached.has(id)) continue; reached.add(id);
    for (const direction of cell.links) queue.push(cells.get(key(movePosition(cell, direction)))!);
  }
  if (reached.size !== cells.size || [...removed].some(k => cells.has(k))) throw new Error('Stair reservation disconnects room');
  return { spaceId: spec.id, rows: spec.rows, columns: spec.columns, cells: [...cells.values()] };
}
export function alignedLowerFrame(upperFrame: FloorFrame, upperExit: GridPosition, lowerEntry: GridPosition): FloorFrame {
  const p = floorPoint(upperFrame, upperExit);
  const result: FloorFrame = [p[0] - lowerEntry.column * SPATIAL_CELL_SIZE, p[1] - STAIR_RECIPE.rise,
    p[2] - lowerEntry.row * SPATIAL_CELL_SIZE - STAIR_RECIPE.separation].map(n => Math.round(n * 1000) / 1000) as FloorFrame;
  if (!validFloorFrame(result)) throw new Error('Stair placement exceeds supported spatial bounds');
  return result;
}
