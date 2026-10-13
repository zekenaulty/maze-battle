import { overlaps } from '../../domain/expedition/topology/geometry';
import type { Bounds, Occupancy } from '../../domain/expedition/topology/types';
import { boundsBuckets, MAX_PREFETCH_BUCKETS, validateBucket, type Bucket } from './buckets';

const key = (bucket: Bucket) => JSON.stringify(bucket);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export class PagedOccupancy {
  private readonly pages = new Map<string, Occupancy[]>();
  private readonly dirty = new Set<string>();
  async fetch(read: (bucket: Bucket) => Promise<Occupancy[] | undefined>, buckets: Bucket[]) {
    for (const bucket of buckets) {
      if (this.pages.has(key(bucket))) continue;
      if (this.pages.size >= MAX_PREFETCH_BUCKETS) throw new Error('Topology prefetch page budget exceeded');
      const stored = await read(bucket);
      const values = stored === undefined ? [] : stored;
      validateBucket(bucket, values);
      this.pages.set(key(bucket), values);
    }
    // Repeated entries must agree and appear in every fetched intersecting bin.
    const identities = new Map<string, Occupancy>();
    for (const values of this.pages.values()) for (const entry of values) {
      if (identities.has(entry.id) && !same(identities.get(entry.id), entry)) throw new Error('Inconsistent occupancy identity');
      identities.set(entry.id, entry);
    }
    for (const entry of identities.values()) {
      for (const bucket of boundsBuckets(entry.bounds)) {
        const page = this.pages.get(key(bucket));
        if (page && !same(page.find(value => value.id === entry.id), entry)) throw new Error('Inconsistent occupancy pages');
      }
    }
  }
  private page(bucket: Bucket) {
    const value = this.pages.get(key(bucket));
    if (!value) throw new Error('Generator exceeded prefetched topology neighborhood');
    return value;
  }
  occupied(bounds: Bounds, except?: string) {
    // Check coverage even if an early bin already contains a collision.
    const pages = boundsBuckets(bounds).map(bucket => this.page(bucket));
    return pages.some(page => page.some(entry => entry.id !== except && overlaps(entry.bounds, bounds)));
  }
  remove(entry: Occupancy) {
    for (const bucket of boundsBuckets(entry.bounds)) {
      const values = this.page(bucket);
      if (!same(values.find(value => value.id === entry.id), entry)) throw new Error('Missing reserved occupancy');
      this.pages.set(key(bucket), values.filter(value => value.id !== entry.id));
      this.dirty.add(key(bucket));
    }
  }
  add(entry: Occupancy) {
    if (this.occupied(entry.bounds)) throw new Error('Overlapping topology proposal');
    for (const bucket of boundsBuckets(entry.bounds)) {
      const values = [...this.page(bucket), entry];
      validateBucket(bucket, values);
      this.pages.set(key(bucket), values);
      this.dirty.add(key(bucket));
    }
  }
  async stage(write: (bucket: Bucket, values: Occupancy[]) => Promise<unknown>) {
    for (const id of this.dirty) {
      const values = this.pages.get(id)!;
      await write(JSON.parse(id) as Bucket, values);
    }
  }
}
