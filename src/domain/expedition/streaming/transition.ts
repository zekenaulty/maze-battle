import { sameAddress } from '../address';
import type { TopologyHeader, TopologySpace } from '../topology/types';
import type { SpaceGeometry } from '../types';
import { moveStream } from './movement';
import { emptyKnowledge, observeStream, rememberStream } from './observation';
import { roomCleared, updateClear } from './progress';
import type { StreamCheckpoint, StreamCommand, StreamCommandContext, StreamKnowledgePage, StreamRoom, StreamTransition } from './types';

export function initializeStream(header: TopologyHeader, room: StreamRoom, geometry: (space: TopologySpace) => SpaceGeometry): StreamTransition {
  const checkpoint: StreamCheckpoint = { version: 2, worldId: header.recipe.worldId, floorId: header.recipe.floorId,
    scopeId: header.scopeId, revision: 0, topologyRevision: header.revision, position: { ...header.start }, home: { ...header.start },
    phase: 'exploring', moves: 0, visitedSpaces: 1, clearedSpaces: 0, collectedChests: 0 };
  const observation = observeStream(checkpoint, room, emptyKnowledge(room.space.spec.id, 0), geometry(room.space));
  const page = rememberStream(emptyKnowledge(room.space.spec.id, 0), observation);
  updateClear(checkpoint, room, page, geometry(room.space));
  return { applied: true, reason: 'Expedition initialized.', checkpoint, pages: [page], observation };
}

export async function applyStreamCommand(context: StreamCommandContext, command: StreamCommand): Promise<StreamTransition> {
  const { header, checkpoint: current } = context;
  if (header.scopeId !== current.scopeId || header.revision !== current.topologyRevision || !context.current.knowledge
    || context.current.space.spec.id !== current.position.spaceId) throw new Error('Stream command snapshot mismatch');
  const original = context.current.knowledge;
  const refuse = (reason: string): StreamTransition => ({ applied: false, reason, checkpoint: current, pages: [],
    observation: observeStream(current, context.current, original, context.geometry(context.current.space)) });
  if (current.phase === 'complete') return refuse('Expedition is complete.');
  const next = structuredClone(current);
  next.revision++;
  let page = structuredClone(original);
  let room = context.current;
  let source: StreamKnowledgePage | undefined;
  let reason = 'Moved.';

  if (command.type === 'move') {
    const moved = await moveStream(context, next, page, command.direction);
    if (moved.reason) return refuse(moved.reason);
    ({ room, page, source } = moved);
    next.moves++;
  } else if (command.type === 'collect') {
    const chest = room.space.spec.chests.find(value => value.cell.row === next.position.row && value.cell.column === next.position.column);
    if (!chest || page.chests[chest.id]?.opened) return refuse('No unopened chest here.');
    page.chests[chest.id] = { id: chest.id, ...next.position, observedAt: next.revision, opened: true };
    next.collectedChests++;
    reason = 'Chest collected.';
  } else if (command.type === 'prepare') {
    if (!page.frontiers[command.frontierId]) return refuse('That frontier has not been observed.');
    const socket = room.sockets.find(value => value.id === command.frontierId);
    if (!socket) throw new Error('Observed frontier has lost its reserved socket');
    const visible = observeStream(current, context.current, original, context.geometry(context.current.space)).visibleCells;
    if (!visible.some(cell => sameAddress(cell, socket.source))) return refuse('Prepare requires a visible frontier.');
    if (socket.status === 'pending') {
      const expanded = await context.prepareNext();
      if (expanded.scopeId !== current.scopeId || expanded.revision !== current.topologyRevision + 1) throw new Error('Preparation made no canonical progress');
      next.topologyRevision = expanded.revision;
    }
    room = await context.loadRoom(next.position.spaceId);
    reason = room.sockets.find(value => value.id === socket.id)?.status === 'pending' ? 'Preparing frontier.' : 'Doorway prepared.';
  } else if (command.type === 'finish') {
    const count = header.rooms * 2 - 1;
    if (!sameAddress(next.position, next.home) || !header.seal || header.seal.revision !== current.topologyRevision
      || current.visitedSpaces !== count || current.clearedSpaces !== count || !roomCleared(room, page, context.geometry(room.space))) {
      return refuse('Explore the sealed scope, collect its chests, and return home first.');
    }
    next.phase = 'complete';
    reason = 'Expedition complete.';
  } else return refuse('Unknown command.');

  const observation = observeStream(next, room, page, context.geometry(room.space));
  page = rememberStream(page, observation);
  updateClear(next, room, page, context.geometry(room.space));
  return { applied: true, reason, checkpoint: next, pages: source ? [source, page] : [page], observation };
}
