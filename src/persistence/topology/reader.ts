import { boundary, childBounds, reservedBounds, world } from '../../domain/expedition/topology/geometry';
import type { ExpansionSocket, TopologyHeader, TopologyReader } from '../../domain/expedition/topology/types';
import { neighborhood } from './buckets';
import type { TopologyTransaction } from './database';
import { PagedOccupancy } from './occupancy';
import type { TopologySpacePage } from './types';
import { validSocket, validSpace } from './validation';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

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
  await occupancy.fetch(bucket => tx.get('buckets', [slot, ...bucket]), neighborhood(world(spec, cell)));
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
