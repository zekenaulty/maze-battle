import { applyStreamCommand } from '../domain/expedition/streaming/transition';
import type { StreamActionReceipt, StreamActionRequest, StreamActionResult, StreamCheckpoint, StreamRoom } from '../domain/expedition/streaming/types';
import { topologyTransaction, type TopologyTransaction } from './topology/database';
import { expandTopologyInTransaction } from './topologyRepository';
import { validId } from './topology/validation';
import { loadStreamRoom, requireCurrentKnowledge, streamControl, streamGeometry, streamRecord } from './streamRecords';
import { streamActionSignature, streamCheck, validateStreamReceipt } from './streamValidation';
import { validateStreamTransition } from './streamTransitions';
import { validateStreamEvidence } from './streamEvidence';
import type { StreamGeometryReader } from './streamTypes';

async function actionAt(tx: TopologyTransaction, slot: string, request: StreamActionRequest | string, checkpoint: StreamCheckpoint) {
  const id = typeof request === 'string' ? request : request.actionId;
  const receipt = await tx.get('streamActions', [slot, id]);
  if (receipt !== undefined) {
    validateStreamReceipt(receipt, id, checkpoint);
    if (typeof request !== 'string') streamCheck(receipt.signature === streamActionSignature(request), 'action ID reused with different input');
  }
  return receipt;
}
/** Query only. Exact requests check identity; ID-only lookup recovers the saved request. */
export async function loadStreamAction(slot: string, requestOrId: StreamActionRequest | string): Promise<StreamActionReceipt | undefined> {
  validId(slot);
  const input = structuredClone(requestOrId);
  if (typeof input === 'string') validId(input); else streamActionSignature(input);
  return topologyTransaction(async tx => actionAt(tx, slot, input, (await streamRecord(tx, slot)).checkpoint));
}

/**
 * Pure local execution: no reservations or external awaits. Accepted refusals are
 * durable too; fencing conflicts are not admitted. Storage/domain failures reject
 * and roll back everything. All results are compact; load the current snapshot
 * separately. Never evict receipts to make room for another command.
 * geometryReader must be a synchronous, pure reader of the pinned schematic.
 */
export async function executeStreamAction(slot: string, request: StreamActionRequest, geometryReader?: StreamGeometryReader): Promise<StreamActionResult> {
  validId(slot);
  const signature = streamActionSignature(request);
  const input = structuredClone(request);
  return topologyTransaction(async tx => {
    const { root, checkpoint } = await streamRecord(tx, slot);
    const existing = await actionAt(tx, slot, input, checkpoint);
    if (existing !== undefined) return existing.result; // Reconcile before current epoch/revision fencing.
    const control = await streamControl(tx, slot);
    const conflict = (reason: string): StreamActionResult => ({ actionId: input.actionId, disposition: 'conflict',
      beforeRevision: input.expectedRevision, afterRevision: checkpoint.revision, topologyRevision: checkpoint.topologyRevision, reason });
    if (!control || control.sessionId !== input.sessionId || control.epoch !== input.epoch) return conflict('Control ownership changed.');
    if (checkpoint.revision !== input.expectedRevision || checkpoint.topologyRevision !== input.expectedTopologyRevision) return conflict('Checkpoint or topology revision conflict.');
    streamCheck(checkpoint.revision < Number.MAX_SAFE_INTEGER, 'checkpoint revision exhausted');
    let header = root.header;
    let expansions = 0;
    const rooms = new Map<string, StreamRoom>();
    const geometry = streamGeometry(geometryReader);
    const loadRoom = async (id: string) => {
      streamCheck(rooms.has(id) || rooms.size < 2, 'command exceeded source/destination room budget');
      // Re-read staged records: preparing can resolve an index already loaded above.
      const room = await loadStreamRoom(tx, slot, id, header, checkpoint.revision);
      const source = rooms.get(checkpoint.position.spaceId);
      streamCheck(room.knowledge || !Object.values(source?.knowledge?.openings ?? {}).some(port => port.destination?.spaceId === id), 'previously visited room has lost its knowledge page');
      if (room.knowledge) validateStreamEvidence(room, room.knowledge, geometry(room.space));
      rooms.set(id, room);
      return structuredClone(room);
    };
    const current = await loadRoom(checkpoint.position.spaceId);
    requireCurrentKnowledge(checkpoint, current);
    const command = input.command;
    const expectedExpansions = command.type === 'prepare'
      && current.sockets.some(socket => socket.id === command.frontierId && socket.status === 'pending') ? 1 : 0;
    const transition = await applyStreamCommand({ header, checkpoint: structuredClone(checkpoint), current, loadRoom,
      geometry: space => { streamCheck(rooms.has(space.spec.id), 'geometry requested outside loaded rooms'); return geometry(space); },
      prepareNext: async () => {
        streamCheck(input.command.type === 'prepare' && expectedExpansions === 1 && expansions === 0, 'only one canonical expansion per pending prepare');
        const result = await expandTopologyInTransaction(tx, slot, { scopeId: header.scopeId, requestId: input.actionId, expectedRevision: header.revision });
        streamCheck(result.status === 'committed' && result.header.revision === header.revision + 1, 'canonical prepare made no progress');
        expansions++; header = result.header;
        return structuredClone(header);
      },
    }, input.command);
    validateStreamTransition(checkpoint, input, transition, header, rooms, expansions, expectedExpansions, geometry);
    for (const page of transition.pages) await tx.put('streamKnowledge', [slot, page.spaceId], page);
    if (transition.applied) await tx.put('streamCheckpoints', [slot], transition.checkpoint);
    const result: StreamActionResult = { actionId: input.actionId, disposition: transition.applied ? 'applied' : 'refused',
      beforeRevision: checkpoint.revision, afterRevision: transition.checkpoint.revision,
      topologyRevision: transition.checkpoint.topologyRevision, reason: transition.reason };
    const receipt = { request: input, signature, result };
    validateStreamReceipt(receipt, input.actionId, transition.checkpoint);
    await tx.put('streamActions', [slot, input.actionId], receipt);
    await tx.stageRoot(slot, { ...root, header });
    return result;
  });
}
