import type { AgenticaObservation } from '../contracts';
import type { DirectedAgenticaBinding } from './contracts';
import type { StreamSnapshot } from '../../../persistence/streamTypes';
import type { StoredDirectedStreamOperation } from '../../../persistence/directedStreamTypes';
import { projectPlanningFrame } from '../../expedition/planning/projection';
import { snapshotDestinationLimits } from '../../../domain/directed/destinationLimits';
import { scopeDirectedFrame } from './scope';

export function directedUsage(record: StoredDirectedStreamOperation) {
  const operation = record.state.operation;
  return { steps: operation.steps, replans: operation.replans, limits: snapshotDestinationLimits(operation.limits),
    startedAt: operation.startedAt, deadline: operation.deadline };
}

/** Actor projection only; neither the world recipe nor undiscovered topology enters the wire. */
export function directedObservation(snapshot: StreamSnapshot, binding: DirectedAgenticaBinding,
  record?: StoredDirectedStreamOperation, detail: 'operation' | 'room' = 'operation'): AgenticaObservation {
  if (!snapshot.room.knowledge) throw new Error('Missing current actor knowledge.');
  const frame = projectPlanningFrame({ checkpoint: snapshot.checkpoint, observation: snapshot.observation,
    knowledge: snapshot.room.knowledge, control: binding.control }, {
    sessionId: binding.sessionId, epoch: binding.control.epoch, runId: binding.runId,
    objectiveId: binding.objectiveId, actorId: 'party', scopeId: binding.scopeId,
    worldId: binding.worldId, floorId: binding.floorId,
  }, 60_000);
  const view = detail === 'room' ? scopeDirectedFrame(frame, binding.destination)
    : { observationId: frame.observationId, checkpoint: frame.checkpoint, view: { kind: 'operation' } };
  return { observationId: crypto.randomUUID(), revision: snapshot.checkpoint.revision,
    observedAt: new Date().toISOString(), data: { ...view, destination: structuredClone(binding.destination),
      ...(binding.arrivalPolicy ? { arrivalPolicy: binding.arrivalPolicy } : {}),
      ...(record ? { travel: { id: record.state.operation.id, status: record.state.operation.status,
        paused: record.state.paused, reason: record.state.operation.reason, usage: directedUsage(record) } } : {}) }, facts: [] };
}
