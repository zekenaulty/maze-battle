import type { MemoryContextSelection } from './contextSelection';
import { normalizeMemorySelection } from './contextSelection';
import { projectDirectedMemory, recallDirectedDestination } from './memory';
import type { DirectedSession } from './operationTypes';
import type { PresentedContext } from './types';

export function presentDirectedMemory(session: DirectedSession, id: string, purpose: PresentedContext['purpose'],
  selection: MemoryContextSelection): PresentedContext {
  const normalized = normalizeMemorySelection(selection);
  const identity = { worldId: session.world.id, floorId: session.world.floorId, observerId: session.actor.id };
  const packet = normalized.kind === 'overview'
    ? projectDirectedMemory(session.knowledge, session.actor.position, identity, normalized.bounds)
    : recallDirectedDestination(session.knowledge, session.actor.position, identity, normalized.target, normalized.bounds);
  return { id, observerId: session.actor.id, knowledgeRevision: session.knowledge.revision, purpose,
    selection: normalized, observationIds: packet.memory.sourceIds, json: packet.json, bytes: packet.bytes };
}
