import { opposite } from '../../maze/movement';
import type { SpaceSpec } from '../types';
import { connection, passageBounds, spaceBounds } from './geometry';
import { choosePlacement, reserveSockets } from './placement';
import { keyedSeed, validateRecipe } from './seed';
import type { Bounds, ExpansionProposal, TopologyDelta, TopologyHeader, TopologyReader, TopologyRecipe, TopologySpace } from './types';

function space(id: string, kind: SpaceSpec['kind'], bounds: Bounds, seed: number): TopologySpace {
  return { schematic: 'stone-room-v1', spec: {
    id, kind, name: kind === 'room' ? 'Stone Hall' : 'Passage', seed,
    origin: { row: bounds.row, column: bounds.column }, rows: bounds.rows, columns: bounds.columns,
    openings: [], chests: kind === 'room' && id !== 'entry' ? [{ id: `${id}:chest`, cell: { row: 1, column: 1 } }] : [],
  } };
}

function seal(header: TopologyHeader) {
  if (header.nextSocket === header.socketCount) {
    header.seal = { revision: header.revision, reason: header.rooms === header.roomBudget ? 'budget' : 'spatial-limit' };
  }
}

export function createTopology(recipe: TopologyRecipe): TopologyDelta {
  validateRecipe(recipe);
  const scopeId = JSON.stringify([recipe.version, recipe.worldId, recipe.floorId, recipe.level, recipe.seed]);
  const root = space('entry', 'room', { row: 0, column: 0, rows: 9, columns: 9 }, keyedSeed(recipe.seed, 'entry'));
  const header: TopologyHeader = { version: 1, recipe: { ...recipe }, scopeId, revision: 0,
    start: { spaceId: 'entry', row: 4, column: 4 }, roomBudget: 6 + 2 * recipe.level, rooms: 1, nextSocket: 0, socketCount: 0 };
  const delta: TopologyDelta = { scopeId, expectedRevision: -1, requestId: 'initialize', header,
    spaces: [root], sockets: [], connections: [], addOccupancy: [{ id: 'entry', kind: 'space', bounds: spaceBounds(root.spec) }],
    removeOccupancy: [], work: { candidates: 0, occupancyQueries: 0 } };
  delta.sockets = reserveSockets({ occupied: () => false }, root.spec, recipe.seed, 0, header.roomBudget - 1, undefined, delta.addOccupancy, delta.work);
  header.socketCount = delta.sockets.length;
  seal(header);
  return delta;
}

/** Canonical FIFO expansion. Requests/prefetch can schedule work, never pick winners. */
export function expandTopology(reader: TopologyReader, expectedRevision: number, requestId: string): ExpansionProposal {
  if (typeof requestId !== 'string' || !requestId.trim() || requestId.length > 128) throw new Error('Invalid expansion request ID');
  const current = reader.header();
  if (current.revision !== expectedRevision) return { status: 'conflict', revision: current.revision };
  if (current.seal) return { status: 'sealed', revision: current.revision };
  const socket = reader.socket(current.nextSocket);
  const source = socket && reader.space(socket.source.spaceId)?.spec;
  if (!socket || !source || socket.status !== 'pending') throw new Error('Missing reserved canonical frontier');
  const work = { candidates: 0, occupancyQueries: 0 };
  const bounds = choosePlacement(reader, source, socket, work);
  // Identity belongs to the parent socket, not a candidate's coordinates or retry.
  const room = space(`${socket.id}:room`, 'room', bounds, keyedSeed(current.recipe.seed, `${socket.id}:room`));
  const passage = space(`${socket.id}:passage`, 'passage', passageBounds(source, bounds, socket.direction), keyedSeed(current.recipe.seed, `${socket.id}:passage`));
  const header: TopologyHeader = { ...current, revision: current.revision + 1, rooms: current.rooms + 1, nextSocket: current.nextSocket + 1 };
  const delta: TopologyDelta = { scopeId: current.scopeId, expectedRevision, requestId, header,
    spaces: [room, passage], sockets: [], resolved: { ...socket, status: 'linked' },
    connections: [connection(`${socket.id}:entrance`, source, passage.spec, socket.direction), connection(`${socket.id}:exit`, passage.spec, room.spec, socket.direction)],
    addOccupancy: [room, passage].map(value => ({ id: value.spec.id, kind: 'space', bounds: spaceBounds(value.spec) })),
    removeOccupancy: [socket.id], work };
  const remaining = header.roomBudget - header.rooms - (header.socketCount - header.nextSocket);
  delta.sockets = reserveSockets(reader, room.spec, current.recipe.seed, header.socketCount, remaining,
    opposite(socket.direction), delta.addOccupancy, work, socket.id);
  header.socketCount += delta.sockets.length;
  seal(header);
  return { status: 'ready', delta };
}
