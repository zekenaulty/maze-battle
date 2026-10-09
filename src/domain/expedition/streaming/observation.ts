import { addressKey } from '../address';
import { observeExpedition } from '../observation';
import { resolvedSpaceSpec } from '../topology/projection';
import type { ExpeditionCheckpoint, SpaceGeometry } from '../types';
import type { StreamCheckpoint, StreamKnowledgePage, StreamObservation, StreamRoom } from './types';

export function emptyKnowledge(spaceId: string, revision: number): StreamKnowledgePage {
  return { version: 1, spaceId, revision, cells: {}, openings: {}, chests: {}, frontiers: {}, completedExits: [], cleared: false };
}

export function observeStream(checkpoint: StreamCheckpoint, room: StreamRoom, page: StreamKnowledgePage, geometry: SpaceGeometry): StreamObservation {
  if (checkpoint.position.spaceId !== room.space.spec.id || page.spaceId !== room.space.spec.id) throw new Error('Observation space mismatch');
  const local: ExpeditionCheckpoint = { ...checkpoint, version: 1, knowledge: page,
    openedChestIds: Object.values(page.chests).filter(chest => chest.opened).map(chest => chest.id) };
  const observed = observeExpedition(local, resolvedSpaceSpec(room.space, room.connections), geometry);
  const visible = new Set(observed.visibleCells.map(addressKey));
  return { ...observed, version: 2, phase: checkpoint.phase, topologyRevision: checkpoint.topologyRevision,
    visibleFrontiers: room.sockets.filter(socket => socket.status === 'pending' && visible.has(addressKey(socket.source)))
      .map(socket => ({ ...socket.source, id: socket.id, direction: socket.direction, observedAt: checkpoint.revision })) };
}

export function rememberStream(page: StreamKnowledgePage, observation: StreamObservation): StreamKnowledgePage {
  const next = structuredClone(page);
  next.revision = observation.revision;
  for (const cell of observation.visibleCells) next.cells[addressKey(cell)] = structuredClone(cell);
  for (const opening of observation.visibleOpenings) next.openings[opening.id] = structuredClone(opening);
  for (const chest of observation.visibleChests) next.chests[chest.id] = structuredClone(chest);
  const visible = new Set(observation.visibleCells.map(addressKey));
  for (const [id, frontier] of Object.entries(next.frontiers)) {
    if (visible.has(addressKey(frontier))) delete next.frontiers[id];
  }
  for (const frontier of observation.visibleFrontiers) next.frontiers[frontier.id] = structuredClone(frontier);
  return next;
}
