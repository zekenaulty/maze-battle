import type { GridPosition } from '../../domain/types';
import { overlaps } from '../../domain/expedition/topology/geometry';
import type { Bounds, Occupancy } from '../../domain/expedition/topology/types';

export const BUCKET_SIDE = 16;
export const MAX_BUCKET_ENTRIES = 256;
export const MAX_PREFETCH_BUCKETS = 25;
export type Bucket = [number, number];

export function bucketBounds([row, column]: Bucket): Bounds {
  return { row: row * BUCKET_SIDE, column: column * BUCKET_SIDE, rows: BUCKET_SIDE, columns: BUCKET_SIDE };
}

export function boundsBuckets(bounds: Bounds): Bucket[] {
  if (![bounds.row, bounds.column, bounds.rows, bounds.columns, bounds.row + bounds.rows, bounds.column + bounds.columns].every(Number.isSafeInteger)
    || bounds.rows < 1 || bounds.columns < 1 || bounds.rows > 32 || bounds.columns > 32) throw new Error('Invalid bounded occupancy rectangle');
  const buckets: Bucket[] = [];
  for (let row = Math.floor(bounds.row / BUCKET_SIDE); row <= Math.floor((bounds.row + bounds.rows - 1) / BUCKET_SIDE); row++) {
    for (let column = Math.floor(bounds.column / BUCKET_SIDE); column <= Math.floor((bounds.column + bounds.columns - 1) / BUCKET_SIDE); column++) buckets.push([row, column]);
  }
  return buckets;
}

/**
 * A candidate reaches <=7 gap +15 room =22 cells from the source boundary.
 * A new fallback reservation adds <=6: total <=28; transverse extent <=7+6=13.
 * Fallback placement is smaller. Thus every read/write rectangle fits +/-32.
 * Five bins centered on floor(boundary/16) cover that inclusive window for ANY
 * integer alignment (also negative). Bins index rectangles, never align rooms.
 */
export function neighborhood(point: GridPosition): Bucket[] {
  if (![point.row - 32, point.row + 32, point.column - 32, point.column + 32].every(Number.isSafeInteger)) throw new Error('Topology neighborhood exceeds safe coordinates');
  const center = [Math.floor(point.row / BUCKET_SIDE), Math.floor(point.column / BUCKET_SIDE)];
  const buckets: Bucket[] = [];
  for (let row = center[0] - 2; row <= center[0] + 2; row++) {
    for (let column = center[1] - 2; column <= center[1] + 2; column++) buckets.push([row, column]);
  }
  return buckets;
}

/** Disjoint integer rectangles use at least one of a bin's 256 cells each. */
export function validateBucket(bucket: Bucket, values: Occupancy[]) {
  if (!Array.isArray(values) || values.length > MAX_BUCKET_ENTRIES) throw new Error('Invalid occupancy bucket capacity');
  const area = bucketBounds(bucket);
  const cells = new Set<string>();
  const ids = new Set<string>();
  for (const entry of values) {
    if (!entry || typeof entry.id !== 'string' || !entry.id.length || entry.id.length > 128 || ids.has(entry.id)
      || !['space', 'reservation'].includes(entry.kind)) throw new Error('Invalid occupancy identity');
    ids.add(entry.id);
    boundsBuckets(entry.bounds);
    if (!overlaps(area, entry.bounds)) throw new Error('Occupancy outside bucket');
    for (let row = Math.max(area.row, entry.bounds.row); row < Math.min(area.row + 16, entry.bounds.row + entry.bounds.rows); row++) {
      for (let column = Math.max(area.column, entry.bounds.column); column < Math.min(area.column + 16, entry.bounds.column + entry.bounds.columns); column++) {
        const key = `${row},${column}`;
        if (cells.has(key)) throw new Error('Overlapping occupancy');
        cells.add(key);
      }
    }
  }
}
