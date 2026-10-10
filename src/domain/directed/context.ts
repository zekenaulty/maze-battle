import type { DirectedSession } from './operationTypes';
import { DIRECTED_LIMITS, DIRECTED_VERSION } from './types';
import type { PresentedContext, Remembered } from './types';

export function presentDirected(session: DirectedSession, id: string, purpose: PresentedContext['purpose']): PresentedContext {
  const { actor, knowledge } = session;
  if (knowledge.worldId !== session.world.id || knowledge.observerId !== actor.id) {
    throw new Error('Context world/observer mismatch.');
  }
  const evidence = new Map<string, number>();
  const provenance = (entry: { observationId: string; observedAt: number }) => {
    evidence.set(entry.observationId, entry.observedAt);
    return {
      observationId: entry.observationId, observedAt: entry.observedAt,
      status: entry.observedAt === knowledge.revision ? 'current' : 'remembered',
    };
  };
  const entries = <T>(records: Record<string, Remembered<T>>) => Object.keys(records).sort().map(key => ({
    value: records[key].value, ...provenance(records[key]),
  }));
  const { spaceId, row, column } = actor.position;
  const json = JSON.stringify({
    version: DIRECTED_VERSION, worldId: knowledge.worldId, floorId: session.world.floorId, observerId: actor.id,
    position: { spaceId, row, column }, knowledgeRevision: knowledge.revision,
    cells: entries(knowledge.cells), spaces: entries(knowledge.spaces), features: entries(knowledge.features),
    absent: Object.keys(knowledge.absent).sort().map(featureId => ({ featureId, ...provenance(knowledge.absent[featureId]) })),
    blockedEdges: entries(knowledge.blockedEdges ?? {}),
    ...(knowledge.perception ? {
      perception: { value: knowledge.perception.value, ...provenance(knowledge.perception) },
      cues: knowledge.cues ? { value: knowledge.cues.value, ...provenance(knowledge.cues) } : undefined,
      examinations: entries(knowledge.examinations ?? {}),
      inspection: knowledge.inspection ? { value: knowledge.inspection.value, ...provenance(knowledge.inspection) } : undefined,
    } : {}),
  });
  const bytes = new TextEncoder().encode(json).byteLength;
  if (bytes > DIRECTED_LIMITS.bytes) throw new Error('Directed context exceeds byte limit.');
  return {
    id, observerId: actor.id, knowledgeRevision: knowledge.revision, purpose,
    observationIds: [...evidence].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([key]) => key),
    json, bytes,
  };
}
