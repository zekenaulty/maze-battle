import { reservedBounds } from '../../domain/expedition/topology/geometry';
import type { TopologyDelta } from '../../domain/expedition/topology/types';
import { boundsBuckets } from './buckets';
import type { TopologyTransaction } from './database';
import { PagedOccupancy, type Frontier } from './reader';
import type { TopologySpacePage } from './types';
import { validSocket, validSpace } from './validation';

/** Only canonical, locally generated deltas enter here; never a public proposal API. */
export async function stageDelta(tx: TopologyTransaction, slot: string, delta: TopologyDelta, frontier?: Frontier) {
  const occupancy = frontier?.occupancy ?? new PagedOccupancy();
  if (frontier) {
    occupancy.remove({ id: frontier.socket.id, kind: 'reservation', bounds: reservedBounds(frontier.source.space.spec, frontier.socket) });
  } else {
    await occupancy.fetch(tx, slot, delta.addOccupancy.flatMap(entry => boundsBuckets(entry.bounds)));
  }
  for (const entry of delta.addOccupancy) occupancy.add(entry);
  const spaces = new Map<string, TopologySpacePage>();
  if (frontier) spaces.set(frontier.source.space.spec.id, structuredClone(frontier.source));
  for (const space of delta.spaces) {
    if (await tx.get('spaces', [slot, space.spec.id]) !== undefined) throw new Error('Topology space already exists');
    spaces.set(space.spec.id, { space, connections: [] });
  }
  for (const link of delta.connections) {
    for (const id of [link.from.spaceId, link.to.spaceId]) {
      const page = spaces.get(id);
      if (!page) throw new Error('Unprefetched connection endpoint');
      page.connections.push(link);
    }
  }
  for (const [id, page] of spaces) {
    validSpace(page, id);
    await tx.put('spaces', [slot, id], page);
  }
  for (const socket of delta.sockets) {
    validSocket(socket, socket.sequence);
    if (await tx.get('sockets', [slot, socket.sequence]) !== undefined) throw new Error('Topology socket already exists');
    await tx.put('sockets', [slot, socket.sequence], socket);
  }
  if (delta.resolved) await tx.put('sockets', [slot, delta.resolved.sequence], delta.resolved);
  await occupancy.stage(tx, slot);
}
