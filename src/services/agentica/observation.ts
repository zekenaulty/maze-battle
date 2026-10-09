import type { StreamActionResult } from '../../domain/expedition/streaming/types';
import type { StreamSnapshot } from '../../persistence/streamTypes';
import { projectPlanningFrame } from '../expedition/planning/projection';
import type { AgenticaAction, AgenticaGameBinding, AgenticaObservation, AgenticaResult } from './contracts';

export function createAgenticaObservation(snapshot: StreamSnapshot, binding: AgenticaGameBinding): AgenticaObservation {
  const knowledge = snapshot.room.knowledge;
  if (!knowledge) throw new Error('Agentica host: missing current knowledge');
  const frame = projectPlanningFrame({ checkpoint: snapshot.checkpoint, observation: snapshot.observation, knowledge, control: binding.control },
    { sessionId: binding.sessionId, epoch: binding.control.epoch, runId: binding.runId, objectiveId: binding.objectiveId, actorId: 'party',
      scopeId: binding.scopeId, worldId: binding.worldId, floorId: binding.floorId }, 60_000);
  const observation: AgenticaObservation = { observationId: crypto.randomUUID(), revision: snapshot.checkpoint.revision,
    observedAt: new Date().toISOString(), data: { ...frame, objective: { kind: binding.objective,
      fulfilled: binding.objective === 'first-chest' ? snapshot.checkpoint.collectedChests >= 1 : snapshot.checkpoint.phase === 'complete' } }, facts: [] };
  if (new TextEncoder().encode(JSON.stringify(observation)).byteLength > 65536) throw new Error('Agentica host: observation exceeds wire budget');
  return observation;
}

/** Must be persisted with the effect. Calling this again would create DIFFERENT evidence. */
export function createAgenticaResult(action: AgenticaAction, binding: AgenticaGameBinding, domain: StreamActionResult | undefined, snapshot: StreamSnapshot): AgenticaResult {
  const afterRevision = snapshot.checkpoint.revision;
  const disposition = domain?.disposition ?? 'applied'; // undefined means the read-only observe capability.
  if (!domain && action.capabilityId !== 'maze.observe') throw new Error('Agentica host: missing command result');
  if (domain && domain.actionId !== action.actionId) throw new Error('Agentica host: result action mismatch');
  if ((disposition === 'applied' || disposition === 'refused') && domain
    && (domain.afterRevision !== afterRevision || domain.beforeRevision !== action.expectedRevision)) throw new Error('Agentica host: original result observation mismatch');
  if (!domain && action.expectedRevision !== afterRevision) throw new Error('Agentica host: stale observation query');
  const evidenceId = crypto.randomUUID();
  const observation = createAgenticaObservation(snapshot, binding);
  const result: AgenticaResult = { actionId: action.actionId, sessionId: action.sessionId, sessionEpoch: action.sessionEpoch,
    disposition, beforeRevision: disposition === 'applied' && domain ? domain.beforeRevision : afterRevision,
    afterRevision, evidenceId, summary: domain?.reason ?? 'Current observed room.', observation };
  const fulfilled = binding.objective === 'first-chest' ? snapshot.checkpoint.collectedChests >= 1 : snapshot.checkpoint.phase === 'complete';
  if (disposition === 'applied' && fulfilled) result.completion = { objectiveId: binding.objectiveId, evidenceId,
    summary: binding.objective === 'first-chest' ? 'The party has collected its first chest in this expedition.' : 'The sealed expedition is explored, its chests collected, and the party returned home.' };
  return result;
}
