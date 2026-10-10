import { addressKey } from '../../expedition/address';
import type { CellAddress } from '../../expedition/types';
import type { KnowledgeProjection } from '../types';
import { assertMemoryInput, memoryBounds } from './bounds';
import { memoryBudget, memoryEnvelope } from './budget';
import { compareIds, fact, own } from './evidence';
import { createMemoryIndex } from './graph';
import type { DirectedMemoryOverview, MemoryBounds, MemoryIdentity, MemoryPacket } from './types';

export function projectDirectedMemory(knowledge: KnowledgeProjection, position: CellAddress, identity: MemoryIdentity,
  requestedBounds?: Partial<MemoryBounds>): MemoryPacket<DirectedMemoryOverview> {
  const bounds = memoryBounds(requestedBounds);
  assertMemoryInput(knowledge, position, identity, bounds);
  const index = createMemoryIndex(knowledge, position);
  const knownRoom = index.roomIds.includes(position.spaceId);
  const initial: DirectedMemoryOverview = {
    ...memoryEnvelope(knowledge, position, identity, bounds, index), kind: 'overview',
    currentRoom: { roomId: position.spaceId, status: knownRoom ? 'known' : 'unknown',
      cells: [], features: [], examinations: [], blockedEdges: [] }, nearby: [], distant: [], connections: [],
  };
  if (knownRoom) initial.omissions.rooms--;
  const budget = memoryBudget(initial, { cells: 0, rooms: 1, facts: 0, connections: 0 });
  const space = own(knowledge.spaces, position.spaceId);
  if (space) budget.add(next => { next.currentRoom.space = fact(space, knowledge.revision); }, { spaceDetails: 1 }, { facts: 1 });
  const localCells = index.cells.filter(entry => entry.value.address.spaceId === position.spaceId).sort((a, b) => {
    const distance = (address: CellAddress) => Math.abs(address.row - position.row) + Math.abs(address.column - position.column);
    return distance(a.value.address) - distance(b.value.address) || compareIds(addressKey(a.value.address), addressKey(b.value.address));
  });
  for (const entry of localCells) budget.add(next => { next.currentRoom.cells.push(fact(entry, knowledge.revision)); },
    { cells: 1 }, { cells: 1 });
  for (const entry of index.features.filter(item => item.value.position.spaceId === position.spaceId)) {
    if (!budget.add(next => { next.currentRoom.features.push(fact(entry, knowledge.revision)); }, { features: 1 }, { facts: 1 })) continue;
    const examination = own(knowledge.examinations ?? {}, entry.value.id);
    if (examination) budget.add(next => { next.currentRoom.examinations.push(fact(examination, knowledge.revision)); },
      { examinations: 1 }, { facts: 1 });
  }
  for (const key of Object.keys(knowledge.blockedEdges ?? {}).sort(compareIds)) {
    const entry = knowledge.blockedEdges![key];
    if (entry.value.from.spaceId === position.spaceId) budget.add(next => { next.currentRoom.blockedEdges.push(fact(entry, knowledge.revision)); },
      { blockedEdges: 1 }, { facts: 1 });
  }
  if (knowledge.perception) budget.add(next => { next.perception = fact(knowledge.perception!, knowledge.revision); },
    { perception: 1 }, { facts: 1 });
  if (knowledge.cues) budget.add(next => {
    next.cues = { frame: 'source-observation-only', fact: fact(knowledge.cues!, knowledge.revision) };
  }, { cues: 1 }, { facts: Math.max(1, knowledge.cues.value.length) });
  if (knowledge.inspection) budget.add(next => {
    const entry = knowledge.inspection!;
    const { coveredCells, ...value } = entry.value;
    next.inspection = fact({ ...entry, value: { ...value, coveredCellCount: coveredCells.length, coverageDetail: 'omitted' as const } }, knowledge.revision);
  }, { inspection: 1 }, { facts: 1 });

  const near = index.roomIds.filter(id => id !== position.spaceId && (index.roomHops.get(id)?.distance ?? Infinity) <= bounds.nearHops)
    .sort((a, b) => index.roomHops.get(a)!.distance - index.roomHops.get(b)!.distance || compareIds(a, b));
  const included = new Set([position.spaceId]);
  for (const roomId of near) {
    if (budget.add(next => { next.nearby.push(index.summarizeRoom(roomId)); }, { rooms: 1 }, { rooms: 1 })) included.add(roomId);
  }
  for (const connection of index.connections) {
    if (included.has(connection.from.spaceId) && included.has(connection.to.spaceId)) {
      budget.add(next => { next.connections.push(connection); }, { connections: 1 }, { connections: 1 });
    }
  }
  const nearbyIds = new Set(near);
  for (const roomId of index.roomIds.filter(id => id !== position.spaceId && !nearbyIds.has(id))) {
    budget.add(next => { next.distant.push(index.summarizeRoom(roomId)); }, { rooms: 1 }, { rooms: 1 });
  }
  return budget.finish();
}
