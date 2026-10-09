import { addressKey, sameAddress } from '../domain/expedition/address';
import { roomCleared } from '../domain/expedition/streaming/progress';
import { resolvedSpaceSpec } from '../domain/expedition/topology/projection';
import type { StreamKnowledgePage, StreamRoom } from '../domain/expedition/streaming/types';
import type { SpaceGeometry } from '../domain/expedition/types';
import { streamCheck } from './streamValidation';

/** Cross-check only already learned evidence. Never add generated cells or destinations. */
export function validateStreamEvidence(room: StreamRoom, page: StreamKnowledgePage, geometry?: SpaceGeometry) {
  const spec = resolvedSpaceSpec(room.space, room.connections);
  const parent = room.connections.filter(link => link.to.spaceId === spec.id);
  streamCheck(spec.id === 'entry' ? parent.length === 0 && page.parentOpeningId === undefined
    : parent.length === 1 && page.parentOpeningId === `${parent[0].id}:to`, 'knowledge parent differs from committed tree');
  const directions = new Set<string>();
  for (const opening of Object.values(page.openings)) {
    const port = spec.openings.find(value => value.id === opening.id);
    streamCheck(port && sameAddress(opening, { spaceId: spec.id, ...port.cell }) && opening.direction === port.direction
      && (opening.destination === undefined || sameAddress(opening.destination, port.destination)), 'learned opening differs from committed doorway');
    streamCheck(!directions.has(opening.direction), 'duplicate observed port');
    directions.add(opening.direction);
  }
  for (const frontier of Object.values(page.frontiers)) {
    const socket = room.sockets.find(value => value.id === frontier.id);
    // A remembered frontier may have been linked by another room's canonical prepare.
    streamCheck(socket && sameAddress(socket.source, frontier) && socket.direction === frontier.direction
      && !directions.has(frontier.direction), 'learned frontier differs from reserved socket');
    directions.add(frontier.direction);
  }
  if (!geometry) return;
  const cells = new Map(geometry.cells.map(cell => [addressKey({ spaceId: spec.id, ...cell }), cell]));
  for (const [key, cell] of Object.entries(page.cells)) {
    const actual = cells.get(key);
    streamCheck(actual && actual.links.length === cell.links.length && actual.links.every(link => cell.links.includes(link)), 'learned cell links differ from immutable geometry');
  }
  streamCheck(page.cleared === roomCleared(room, page, geometry), 'cleared metadata disagrees with canonical work');
}
