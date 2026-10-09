import { vi } from 'vitest';
import { applyStreamCommand, initializeStream } from '../../domain/expedition/streaming/transition';
import { observeStream } from '../../domain/expedition/streaming/observation';
import type { StreamActionReceipt, StreamActionRequest, StreamControl, StreamRoom } from '../../domain/expedition/streaming/types';
import { materializeTopologySpace } from '../../domain/expedition/topology/projection';
import type { TopologyHeader } from '../../domain/expedition/topology/types';
import { claimStreamControl, createStreamSlot, executeStreamAction, loadStreamAction,
  loadStreamControl, loadStreamSnapshot, type StreamSnapshot } from '../../persistence/streamRepository';

export function gate() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/** Only repository I/O is mocked; the command transitions and snapshot observations are real. */
export function reviewRepository() {
  const header: TopologyHeader = { version: 1,
    recipe: { version: 'spaces-v2', worldId: 'review', floorId: 'one', seed: 42, level: 1 },
    scopeId: 'review-scope', revision: 0, start: { spaceId: 'entry', row: 0, column: 0 },
    roomBudget: 1, rooms: 1, nextSocket: 0, socketCount: 0, seal: { revision: 0, reason: 'budget' } };
  const room: StreamRoom = { space: { schematic: 'stone-room-v1', spec: {
    id: 'entry', name: 'Review fixture', kind: 'room', origin: { row: 0, column: 0 }, rows: 3, columns: 3,
    seed: 42, openings: [], chests: [{ id: 'loot', cell: { row: 0, column: 1 } }],
  } }, connections: [], sockets: [] };
  const initial = initializeStream(header, room, materializeTopologySpace);
  room.knowledge = initial.pages[0];
  let snapshot: StreamSnapshot = { checkpoint: initial.checkpoint, room, observation: initial.observation };
  let owner: StreamControl = { sessionId: 'owner-a', epoch: 0 };
  const receipts = new Map<string, StreamActionReceipt>();

  vi.mocked(createStreamSlot).mockImplementation(async () => structuredClone(snapshot));
  vi.mocked(loadStreamSnapshot).mockImplementation(async () => structuredClone(snapshot));
  vi.mocked(loadStreamControl).mockImplementation(async () => structuredClone(owner));
  vi.mocked(claimStreamControl).mockImplementation(async (_slot, sessionId, epoch) => {
    if (owner.epoch !== epoch) throw new Error('Control epoch conflict.');
    owner = { sessionId, epoch: owner.epoch + 1 };
    return structuredClone(owner);
  });
  vi.mocked(loadStreamAction).mockImplementation(async (_slot, request) => {
    const receipt = receipts.get(typeof request === 'string' ? request : request.actionId);
    if (receipt && typeof request !== 'string' && JSON.stringify(receipt.request) !== JSON.stringify(request)) throw new Error('Changed receipt identity.');
    return structuredClone(receipt);
  });
  vi.mocked(executeStreamAction).mockImplementation(async (_slot, input) => {
    const request: StreamActionRequest = structuredClone(input);
    const existing = receipts.get(request.actionId);
    if (existing) return structuredClone(existing.result);
    const before = snapshot.checkpoint;
    if (request.sessionId !== owner.sessionId || request.epoch !== owner.epoch
      || request.expectedRevision !== before.revision || request.expectedTopologyRevision !== before.topologyRevision) {
      return { actionId: request.actionId, disposition: 'conflict', beforeRevision: request.expectedRevision,
        afterRevision: before.revision, topologyRevision: before.topologyRevision, reason: 'Control or revision conflict.' };
    }
    const next = await applyStreamCommand({ header, checkpoint: before, current: structuredClone(snapshot.room),
      geometry: materializeTopologySpace, loadRoom: async () => structuredClone(snapshot.room),
      prepareNext: async () => { throw new Error('No fixture frontier.'); },
    }, request.command);
    const nextRoom = { ...snapshot.room, knowledge: next.pages[0] ?? snapshot.room.knowledge };
    snapshot = { checkpoint: next.checkpoint, room: nextRoom,
      observation: observeStream(next.checkpoint, nextRoom, nextRoom.knowledge!, materializeTopologySpace(nextRoom.space)) };
    const result: StreamActionReceipt['result'] = { actionId: request.actionId, disposition: next.applied ? 'applied' : 'refused',
      beforeRevision: before.revision, afterRevision: next.checkpoint.revision, topologyRevision: next.checkpoint.topologyRevision, reason: next.reason };
    receipts.set(request.actionId, { request, signature: JSON.stringify(request), result });
    return structuredClone(result);
  });
  return { get snapshot() { return structuredClone(snapshot); }, get owner() { return structuredClone(owner); }, receipts };
}
