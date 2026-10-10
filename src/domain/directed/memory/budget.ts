import type { CellAddress } from '../../expedition/types';
import type { KnowledgeProjection } from '../types';
import { collectSourceIds } from './evidence';
import type { MemoryIndex } from './graph';
import type { MemoryBounds, MemoryEnvelope, MemoryIdentity, MemoryOmittedCounts, MemoryPacket } from './types';

const UNKNOWN_BOUNDARIES = [
  'Unobserved rooms, cells, features and world changes are unknown and are not counted as omissions.',
  'Stale means older than the latest observation, not confirmed changed; current is not live world truth.',
  'Inaccessible means no route in actor memory, not no route in the world.',
  'Room bounds do not disclose unobserved cells; summary counts describe remembered facts only.',
  'Cue directions belong to their source observation; cue viewpoints are not retained.',
] as const;

export function memoryEnvelope(knowledge: KnowledgeProjection, position: CellAddress, identity: MemoryIdentity,
  bounds: MemoryBounds, index: MemoryIndex): MemoryEnvelope {
  return {
    version: 'directed-memory-v1', worldId: identity.worldId, observerId: identity.observerId, floorId: identity.floorId,
    knowledgeRevision: knowledge.revision, position: { spaceId: position.spaceId, row: position.row, column: position.column },
    bounds: { ...bounds }, sourceIds: [], unknowns: [...UNKNOWN_BOUNDARIES],
    omissions: {
      rooms: index.roomIds.length, spaceDetails: Object.keys(knowledge.spaces).length, cells: index.cells.length, features: index.features.length,
      examinations: Object.keys(knowledge.examinations ?? {}).length,
      blockedEdges: Object.keys(knowledge.blockedEdges ?? {}).length, connections: index.connections.length,
      absent: Object.keys(knowledge.absent).length, cues: knowledge.cues ? 1 : 0,
      perception: knowledge.perception ? 1 : 0, inspection: knowledge.inspection ? 1 : 0,
      causes: { scope: true, cells: false, rooms: false, facts: false, connections: false, bytes: false },
    },
  };
}
export function packet<T extends MemoryEnvelope>(memory: T): MemoryPacket<T> {
  memory.sourceIds = collectSourceIds(memory);
  const json = JSON.stringify(memory);
  const bytes = new TextEncoder().encode(json).byteLength;
  if (bytes > memory.bounds.bytes) throw new Error('Memory byte budget cannot fit required envelope.');
  return { memory, json, bytes };
}

/** Candidates are atomic: never cut JSON, a fact, or its provenance to meet a byte cap. */
export function memoryBudget<T extends MemoryEnvelope>(initial: T,
  initialUsage = { cells: 0, rooms: 0, facts: 0, connections: 0 }) {
  let memory = initial;
  const used = { ...initialUsage };
  packet(memory);
  const add = (change: (next: T) => void, included: Partial<MemoryOmittedCounts>,
    cost: Partial<typeof used> = {}): boolean => {
    for (const key of Object.keys(cost) as (keyof typeof used)[]) {
      if (used[key] + cost[key]! > memory.bounds[key]) {
        memory.omissions.causes[key] = true;
        return false;
      }
    }
    const next = structuredClone(memory);
    change(next);
    for (const key of Object.keys(included) as (keyof MemoryOmittedCounts)[]) next.omissions[key] -= included[key]!;
    next.sourceIds = collectSourceIds(next);
    if (new TextEncoder().encode(JSON.stringify(next)).byteLength > next.bounds.bytes) {
      memory.omissions.causes.bytes = true;
      return false;
    }
    memory = next;
    for (const key of Object.keys(cost) as (keyof typeof used)[]) used[key] += cost[key]!;
    return true;
  };
  return { add, finish: () => packet(memory) };
}
