import { boundary, childBounds } from '../domain/expedition/topology/geometry';
import { addressKey, sameAddress } from '../domain/expedition/address';
import { SpaceResidency } from '../domain/expedition/residency';
import { materializeTopologySpace } from '../domain/expedition/topology/projection';
import type { StreamCheckpoint, StreamRoom } from '../domain/expedition/streaming/types';
import type { TopologyHeader } from '../domain/expedition/topology/types';
import type { TopologyTransaction } from './topology/database';
import { validId, validRoot, validSocket, validSpace } from './topology/validation';
import { validateStreamKnowledge } from './streamKnowledge';
import { streamCheck, validateStreamCheckpoint, validateStreamControl } from './streamValidation';
import type { StreamGeometryReader } from './streamTypes';

export async function streamRecord(tx: TopologyTransaction, slot: string) {
  const root = await tx.get('roots', slot);
  streamCheck(root !== undefined, 'missing slot'); validRoot(root);
  streamCheck(root.streamVersion === 1, 'slot is not gameplay managed; create a fresh stream slot');
  const checkpoint = await tx.get('streamCheckpoints', [slot]);
  streamCheck(checkpoint !== undefined, 'missing gameplay checkpoint');
  validateStreamCheckpoint(checkpoint, root.header);
  return { root, checkpoint };
}
export async function streamControl(tx: TopologyTransaction, slot: string) {
  const value = await tx.get('streamControls', [slot]);
  if (value !== undefined) validateStreamControl(value);
  return value;
}
export async function savedStreamKnowledge(tx: TopologyTransaction, slot: string, id: string, revision: number) {
  validId(id);
  const page = await tx.get('streamKnowledge', [slot, id]);
  if (page !== undefined) validateStreamKnowledge(page, id, revision);
  return page;
}

/** At most one space, four indexed sockets and one SAVED knowledge page. */
export async function loadStreamRoom(tx: TopologyTransaction, slot: string, id: string, header: TopologyHeader, revision: number): Promise<StreamRoom> {
  validId(id);
  const page = await tx.get('spaces', [slot, id]);
  streamCheck(page !== undefined, 'missing room'); validSpace(page, id);
  streamCheck(page.socketSequences !== undefined, 'room lacks socket index; legacy topology cannot enable gameplay');
  const room: StreamRoom = { space: page.space, connections: page.connections, sockets: [] };
  for (const sequence of page.socketSequences) {
    streamCheck(sequence < header.socketCount, 'socket index exceeds header');
    const socket = await tx.get('sockets', [slot, sequence]);
    streamCheck(socket !== undefined, 'missing indexed socket'); validSocket(socket, sequence);
    streamCheck(sameAddress(socket.source, { spaceId: id, ...boundary(page.space.spec, socket.direction) })
      && socket.status === (sequence < header.nextSocket ? 'linked' : 'pending')
      && JSON.stringify(socket.fallback) === JSON.stringify(childBounds(page.space.spec, socket.direction, 5, 5, 1)), 'indexed socket mismatch');
    room.sockets.push(socket);
  }
  const knowledge = await savedStreamKnowledge(tx, slot, id, revision);
  if (knowledge !== undefined) { validateStreamKnowledge(knowledge, id, revision, room); room.knowledge = knowledge; }
  return room;
}

/** Per-operation, source/destination-only immutable geometry with a 450-cell ceiling. */
export function streamGeometry(read: StreamGeometryReader = materializeTopologySpace): StreamGeometryReader {
  const residency = new SpaceResidency(450, spec => read({ schematic: 'stone-room-v1', spec }));
  return space => {
    streamCheck(space.schematic === 'stone-room-v1', 'unsupported schematic');
    return residency.get(space.spec);
  };
}
export function requireCurrentKnowledge(checkpoint: StreamCheckpoint, room: StreamRoom) {
  streamCheck(room.space.spec.id === checkpoint.position.spaceId && room.knowledge !== undefined, 'missing current observed page');
  streamCheck(room.knowledge.revision === checkpoint.revision
    && room.knowledge.cells[addressKey(checkpoint.position)]?.observedAt === checkpoint.revision, 'current page and checkpoint revision disagree');
  return room.knowledge;
}
