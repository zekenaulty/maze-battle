import { boundary, childBounds, overlaps, reservedBounds, world } from '../../domain/expedition/topology/geometry';
import type { Bounds, ExpansionSocket, Occupancy, TopologyHeader, TopologyReader } from '../../domain/expedition/topology/types';
import { boundsBuckets, MAX_PREFETCH_BUCKETS, neighborhood, validateBucket, type Bucket } from './buckets';
import type { TopologyTransaction } from './database';
import type { TopologySpacePage } from './types';
import { validSocket, validSpace } from './validation';

const key = (bucket: Bucket) => JSON.stringify(bucket);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export class PagedOccupancy {
  private readonly pages = new Map<string, Occupancy[]>();
  private readonly dirty = new Set<string>();
  async fetch(tx: TopologyTransaction, slot: string, buckets: Bucket[]) {
    for (const bucket of buckets) {
      if (this.pages.has(key(bucket))) continue;
      if (this.pages.size >= MAX_PREFETCH_BUCKETS) throw new Error('Topology prefetch page budget exceeded');
      const values = await tx.get('buckets', [slot, ...bucket]) ?? [];
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
  async stage(tx: TopologyTransaction, slot: string) {
    for (const id of this.dirty) {
      const values = this.pages.get(id)!;
      await tx.put('buckets', [slot, ...JSON.parse(id) as Bucket], values.length ? values : undefined);
    }
  }
}

export interface Frontier { reader: TopologyReader; occupancy: PagedOccupancy; source: TopologySpacePage; socket: ExpansionSocket }
export async function loadFrontier(tx: TopologyTransaction, slot: string, header: TopologyHeader): Promise<Frontier> {
  const socket = await tx.get('sockets', [slot, header.nextSocket]);
  if (socket === undefined) throw new Error('Missing canonical socket');
  validSocket(socket, header.nextSocket);
  const source = await tx.get('spaces', [slot, socket.source.spaceId]);
  if (source === undefined) throw new Error('Missing canonical source');
  validSpace(source, socket.source.spaceId);
  const spec = source.space.spec;
  const cell = boundary(spec, socket.direction);
  if (socket.status !== 'pending' || spec.kind !== 'room' || socket.source.row !== cell.row || socket.source.column !== cell.column
    || !same(socket.fallback, childBounds(spec, socket.direction, 5, 5, 1))) throw new Error('Invalid canonical frontier');
  const occupancy = new PagedOccupancy();
  await occupancy.fetch(tx, slot, neighborhood(world(spec, cell)));
  const reservation = { id: socket.id, kind: 'reservation' as const, bounds: reservedBounds(spec, socket) };
  // Validate the promise without dropping it from the facade used by the generator.
  occupancy.remove(reservation);
  occupancy.add(reservation);
  return { occupancy, source, socket, reader: {
    header: () => header,
    space: id => { if (id !== spec.id) throw new Error('Unprefetched space read'); return source.space; },
    socket: sequence => { if (sequence !== socket.sequence) throw new Error('Unprefetched socket read'); return socket; },
    occupied: (bounds, except) => occupancy.occupied(bounds, except),
  } };
}
