import type { Direction } from '../../types';
import type { SpaceSpec } from '../types';
import { boundary, childBounds, overlaps, passageBounds, reservedBounds } from './geometry';
import { keyedSeed } from './seed';
import type { Bounds, ExpansionSocket, Occupancy, TopologyReader } from './types';

export const PLACEMENT_ATTEMPTS = 8;
const DIRECTIONS: Direction[] = ['north', 'east', 'south', 'west'];
export interface PlacementWork { candidates: number; occupancyQueries: number }

function safe(bounds: Bounds) {
  return [bounds.row, bounds.column, bounds.row + bounds.rows, bounds.column + bounds.columns].every(Number.isSafeInteger);
}

export function choosePlacement(reader: TopologyReader, source: SpaceSpec, socket: ExpansionSocket, work: PlacementWork): Bounds {
  const seed = reader.header().recipe.seed;
  for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
    work.candidates++;
    const value = keyedSeed(seed, `${socket.id}:candidate:${attempt}`);
    const room = childBounds(source, socket.direction, 7 + 2 * (value % 5), 7 + 2 * ((value >>> 4) % 5), 2 + (value >>> 8) % 6);
    const passage = passageBounds(source, room, socket.direction);
    if (!safe(room) || !safe(passage)) continue;
    work.occupancyQueries += 2;
    if (!reader.occupied(room, socket.id) && !reader.occupied(passage, socket.id)) return room;
  }
  // The parent transaction reserved this entire room and its access passage.
  return { ...socket.fallback };
}

export function reserveSockets(reader: Pick<TopologyReader, 'occupied'>, room: SpaceSpec, seed: number,
  firstSequence: number, quota: number, excluded: Direction | undefined, added: Occupancy[], work: PlacementWork,
  ignoredReservation?: string): ExpansionSocket[] {
  const sockets: ExpansionSocket[] = [];
  const order = DIRECTIONS.filter(direction => direction !== excluded)
    .sort((a, b) => keyedSeed(seed, `${room.id}:${a}`) - keyedSeed(seed, `${room.id}:${b}`));
  for (const direction of order) {
    if (sockets.length >= quota) break;
    const fallback = childBounds(room, direction, 5, 5, 1);
    const bounds = reservedBounds(room, { direction, fallback });
    if (!safe(bounds) || added.some(entry => overlaps(entry.bounds, bounds))) continue;
    work.occupancyQueries++;
    if (reader.occupied(bounds, ignoredReservation)) continue;
    const sequence = firstSequence + sockets.length;
    const id = `socket-${sequence}`;
    sockets.push({ id, sequence, source: { spaceId: room.id, ...boundary(room, direction) }, direction, fallback, status: 'pending' });
    added.push({ id, kind: 'reservation', bounds });
  }
  return sockets;
}
