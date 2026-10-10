import { applyExpeditionCommand, createExpeditionCheckpoint } from '../domain/expedition/commands';
import { materializeSpace } from '../domain/expedition/schematic';
import { observeExpedition } from '../domain/expedition/observation';
import type { ExpeditionActionRequest } from '../domain/expedition/protocol';
import type { ExpeditionPlan } from '../domain/expedition/types';
import type { ExpeditionRecord } from './expeditionDatabase';
import type { ExpeditionActionOutcome } from './expeditionActionTypes';

export function durableFixture(): ExpeditionRecord {
  const plan: ExpeditionPlan = {
    recipe: { version: 'spaces-v1', worldId: 'durable-world', floorId: 'floor-1', seed: 42, level: 1 },
    scopeId: JSON.stringify(['spaces-v1', 'durable-world', 'floor-1', 1, 42]),
    start: { spaceId: 'room-a', row: 0, column: 0 },
    spaces: [{ id: 'room-a', name: 'Receipt fixture', kind: 'room', origin: { row: 0, column: 0 }, rows: 3, columns: 3,
      seed: 42, openings: [], chests: [{ id: 'chest-a', cell: { row: 0, column: 1 } }] }],
  };
  return { plan, checkpoint: createExpeditionCheckpoint(plan, materializeSpace) };
}

export function durableRequest(patch: Partial<ExpeditionActionRequest> = {}): ExpeditionActionRequest {
  return { version: 1, sessionId: 'owner-a', epoch: 0, actionId: 'move-1', expectedRevision: 0,
    command: { type: 'move', direction: 'east' }, ...patch };
}

export function durableOutcome(record: ExpeditionRecord, request: ExpeditionActionRequest): ExpeditionActionOutcome {
  const transition = applyExpeditionCommand(record.plan, record.checkpoint, request.command, materializeSpace);
  const spec = record.plan.spaces.find(space => space.id === transition.checkpoint.position.spaceId)!;
  return structuredClone({ checkpoint: transition.checkpoint, result: {
    actionId: request.actionId, disposition: transition.applied ? 'applied' : 'refused', reason: transition.reason,
    beforeRevision: record.checkpoint.revision, afterRevision: transition.checkpoint.revision,
    observation: observeExpedition(transition.checkpoint, spec, materializeSpace(spec)),
  } });
}
