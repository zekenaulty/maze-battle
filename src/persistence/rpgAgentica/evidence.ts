import type { SaveSlot } from '../../domain/types';
import type { AgenticaObservation } from '../../services/agentica/contracts';
import type { RpgAgenticaBinding } from '../../services/agentica/rpg/contracts';
import { requireRpg } from '../../services/agentica/rpg/validation';
import type { GameWrite } from '../gameTransaction';
import { observationReader } from '../observationNodes';
import type { RpgTravelRecord } from '../rpgTravel/types';

/** Point-read a lawful source receipt; reporting progress does not require rebuilding the memory index. */
export async function rpgOperationObservation(tx: GameWrite, slot: SaveSlot, revision: number,
  binding: RpgAgenticaBinding): Promise<AgenticaObservation> {
  requireRpg(slot.game.id === binding.gameId && slot.observationHead, 'operation source unavailable');
  const node = await observationReader({ get: id => tx.objectStore('observations').get(id) }, binding.gameId).read(slot.observationHead);
  const receipt = node.observation;
  requireRpg(receipt.actor.floor === slot.game.dungeonLevel && receipt.actor.row === slot.game.maze.active.row
    && receipt.actor.column === slot.game.maze.active.column, 'operation observation does not match actor');
  return operationEvidence(receipt, revision, binding);
}

/** A delayed cancellation reports its retained source, never the later owner's world. */
export async function rpgCancelledObservation(tx: GameWrite, travel: RpgTravelRecord, binding: RpgAgenticaBinding) {
  requireRpg(travel.gameId === binding.gameId && travel.operation.status === 'cancelled', 'cancellation lineage changed');
  const node = await observationReader({ get: id => tx.objectStore('observations').get(id) }, binding.gameId).read(travel.sourceHead);
  requireRpg(node.observation.actor.floor === travel.position.floor && node.observation.actor.row === travel.position.row
    && node.observation.actor.column === travel.position.column, 'cancelled source does not match retained journey');
  return operationEvidence(node.observation, travel.control.revision, binding);
}

function operationEvidence(receipt: import('../observationTypes').RpgObservationNode['observation'], revision: number,
  binding: RpgAgenticaBinding): AgenticaObservation {
  return { observationId: crypto.randomUUID(), revision, observedAt: receipt.observedAt, facts: [],
    data: { kind: 'operation', scopeId: binding.scopeId, perspectiveId: 'party', gameId: receipt.gameId,
      floor: receipt.actor.floor, actor: { ...receipt.actor }, sourceHead: { id: receipt.id, gameId: receipt.gameId,
        observedAt: receipt.observedAt, revision: { epoch: receipt.revision.epoch, revision: receipt.revision.revision } } } };
}

export function rpgTravelUsage(travel: RpgTravelRecord) {
  const op = travel.operation;
  return { steps: op.steps, replans: op.replans, limits: op.limits, startedAt: op.startedAt, deadline: op.deadline };
}
