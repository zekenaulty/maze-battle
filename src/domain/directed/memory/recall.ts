import { addressKey } from '../../expedition/address';
import type { CellAddress } from '../../expedition/types';
import type { KnowledgeProjection } from '../types';
import { assertMemoryDestination, assertMemoryInput, memoryBounds } from './bounds';
import { memoryBudget, memoryEnvelope } from './budget';
import { fact, own } from './evidence';
import { geographicBearing } from './geography';
import { createMemoryIndex } from './graph';
import type { DirectedDestinationMemory, MemoryBounds, MemoryDestination, MemoryIdentity, MemoryPacket } from './types';

/** Exact IDs only; no fuzzy search, map page, observation, or refresh is performed. */
export function recallDirectedDestination(knowledge: KnowledgeProjection, position: CellAddress, identity: MemoryIdentity,
  target: MemoryDestination, requestedBounds?: Partial<MemoryBounds>): MemoryPacket<DirectedDestinationMemory> {
  const bounds = memoryBounds(requestedBounds);
  assertMemoryInput(knowledge, position, identity, bounds);
  assertMemoryDestination(target);
  const index = createMemoryIndex(knowledge, position);
  const exactTarget: MemoryDestination = target.kind === 'room' ? { kind: 'room', roomId: target.roomId }
    : target.kind === 'feature' ? { kind: 'feature', featureId: target.featureId }
      : { kind: 'cell', address: { spaceId: target.address.spaceId, row: target.address.row, column: target.address.column } };
  const result: DirectedDestinationMemory = {
    ...memoryEnvelope(knowledge, position, identity, bounds, index), kind: 'destination', target: exactTarget,
    status: 'unknown', geographicBearing: { direction: 'unknown', basis: 'remembered-coordinates' },
    route: { status: 'unknown', reason: 'destination-not-remembered' },
  };
  const used = { cells: 0, rooms: 0, facts: 0, connections: 0 };
  let roomId: string | undefined;
  let address: CellAddress | undefined;
  if (target.kind === 'room' && index.roomIds.includes(target.roomId)) roomId = target.roomId;
  if (target.kind === 'cell') {
    const entry = own(knowledge.cells, addressKey(target.address));
    if (entry) {
      address = entry.value.address;
      roomId = address.spaceId;
      result.cell = fact(entry, knowledge.revision);
      result.omissions.cells--;
      used.cells++;
    }
  }
  if (target.kind === 'feature') {
    const entry = own(knowledge.features, target.featureId);
    const absent = own(knowledge.absent, target.featureId);
    if (entry) {
      address = entry.value.position;
      roomId = address.spaceId;
      result.feature = fact(entry, knowledge.revision);
      result.omissions.features--;
      used.facts++;
    } else if (absent) {
      result.status = 'absent';
      result.absence = fact({ ...absent, value: { featureId: target.featureId } }, knowledge.revision);
      result.omissions.absent--;
      used.facts++;
    }
  }
  if (roomId !== undefined) {
    result.status = 'known';
    result.room = index.summarizeRoom(roomId);
    result.omissions.rooms--;
    used.rooms++;
    result.geographicBearing = geographicBearing(knowledge, position, address ?? roomId);
    result.route = target.kind === 'feature' ? index.routeTo(index.featureTargets(target.featureId))
      : address ? index.routeTo([addressKey(address)]) : result.room.route;
  }
  // The exact result and its route evidence must fit; only supplemental examination can be omitted.
  const budget = memoryBudget(result, used);
  if (target.kind === 'feature' && result.status !== 'unknown') {
    const entry = own(knowledge.examinations ?? {}, target.featureId);
    if (entry) budget.add(next => { next.examination = fact(entry, knowledge.revision); }, { examinations: 1 }, { facts: 1 });
  }
  return budget.finish();
}
