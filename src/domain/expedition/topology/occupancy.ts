import { overlaps } from './geometry';
import type { Bounds, Occupancy } from './types';

const INDEX_SIZE = 16;
export const MAX_QUERY_BUCKETS = 9;
export const MAX_QUERY_ENTRY_CHECKS = MAX_QUERY_BUCKETS * INDEX_SIZE * INDEX_SIZE;

function buckets(bounds: Bounds): string[] {
  if (![bounds.row, bounds.column, bounds.rows, bounds.columns].every(Number.isSafeInteger)
    || bounds.rows < 1 || bounds.columns < 1 || bounds.rows > 32 || bounds.columns > 32
    || !Number.isSafeInteger(bounds.row + bounds.rows) || !Number.isSafeInteger(bounds.column + bounds.columns)) {
    throw new Error('Occupancy query exceeds bounded geometry limits');
  }
  const result: string[] = [];
  for (let row = Math.floor(bounds.row / INDEX_SIZE); row <= Math.floor((bounds.row + bounds.rows - 1) / INDEX_SIZE); row++) {
    for (let column = Math.floor(bounds.column / INDEX_SIZE); column <= Math.floor((bounds.column + bounds.columns - 1) / INDEX_SIZE); column++) result.push(`${row}:${column}`);
  }
  return result;
}

/** Disjoint integer footprints bound each bin to 256 entries, each query to 9 bins.
 * Index bins accelerate intersection tests; they do not align or constrain rooms. */
export class OccupancyIndex {
  private readonly entries = new Map<string, Occupancy>();
  private readonly index = new Map<string, Map<string, Occupancy>>();
  readonly work = { queries: 0, bucketReads: 0, entryChecks: 0 };

  occupied(bounds: Bounds, except?: string): boolean {
    this.work.queries++;
    const seen = new Set<string>();
    for (const key of buckets(bounds)) {
      this.work.bucketReads++;
      for (const entry of this.index.get(key)?.values() ?? []) {
        if (entry.id === except || seen.has(entry.id)) continue;
        seen.add(entry.id);
        this.work.entryChecks++;
        if (overlaps(bounds, entry.bounds)) return true;
      }
    }
    return false;
  }

  add(value: Occupancy) {
    const keys = buckets(value.bounds);
    if (this.entries.has(value.id)) throw new Error('Duplicate occupancy identity');
    if (this.occupied(value.bounds)) throw new Error('Overlapping occupancy footprint');
    const owned = structuredClone(value);
    this.entries.set(owned.id, owned);
    for (const key of keys) {
      const bucket = this.index.get(key) ?? new Map<string, Occupancy>();
      bucket.set(owned.id, owned);
      this.index.set(key, bucket);
    }
  }

  remove(id: string) {
    const entry = this.entries.get(id);
    if (!entry) throw new Error('Missing occupancy reservation');
    for (const key of buckets(entry.bounds)) {
      const bucket = this.index.get(key)!;
      bucket.delete(id);
      if (!bucket.size) this.index.delete(key);
    }
    this.entries.delete(id);
  }

  values(): Occupancy[] { return structuredClone([...this.entries.values()]); }
}
