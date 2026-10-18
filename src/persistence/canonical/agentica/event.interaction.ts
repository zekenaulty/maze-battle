import type { HostOperationEvent } from '../../../services/agentica/sdk/agentica-host.mjs';
import type { GameCheckpoint } from '../game/checkpoint';
import type { InteractionProgress } from '../interaction/types';
import { interactionProgress } from '../interaction/validation';
import { fields } from '../roster/codec';
import type { CanonicalRequest, JsonObject } from '../types';
import { check } from '../validation';
import { equal } from './validation';

export function interactionOutcome(input: InteractionProgress) {
  const p = interactionProgress(input);
  check(p.sequence === 1 && p.binding.command.kind === 'open-chest', 'unsupported interaction progress event');
  return { kind: 'open-chest', outcome: p.status, itemsReceived: (p.result?.lootIds as unknown[] | undefined)?.length ?? 0 };
}

export function interactionObservationData(progress: InteractionProgress, cp: GameCheckpoint,
  source: { sequence: number; id: string; revision: number } | null): JsonObject {
  return { scope: 'actor', actor: { level: cp.position.level, ...cp.position.cell, facing: cp.facing, mode: cp.mode },
    source, interaction: interactionOutcome(progress) };
}

export const interactionSummary = (p: InteractionProgress) => `Chest interaction ${p.status}. Objective completion is not established.`;

/** The binding loader has already verified the progress row and its exact receipt witness. */
export function validateInteractionEventSource(progress: InteractionProgress, source: CanonicalRequest,
  result: JsonObject, event: HostOperationEvent, sequence: number) {
  const p = interactionProgress(progress);
  check(sequence === 1 && p.sequence === sequence && p.sourceAttemptId === source.attemptId
    && source.operation === 'interaction.apply' && equal(source.input, { operationId: p.operationId, sequence: 0 })
    && result.operationId === p.operationId && result.sequence === 1 && result.status === p.status
    && result.reason === p.reason && equal(result.outcome, p.result), 'interaction event progress source changed');
  const observation = fields(event.observation, 'observationId revision observedAt data');
  const data = fields(observation.data, 'scope actor source interaction');
  fields(data.actor, 'level spaceId row column facing mode');
  if (data.source !== null) fields(data.source, 'sequence id revision');
  check(data.scope === 'actor' && equal(data.interaction, interactionOutcome(p))
    && equal(event.usage, {}) && event.summary === interactionSummary(p), 'interaction event projection changed');
}
