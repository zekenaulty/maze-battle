import type { HostOperationEvent } from '../../../services/agentica/sdk/agentica-host.mjs';
import { gameCheckpoint } from '../game/checkpoint';
import type { Publication, ProtocolRef } from './types';

export function transferObservation(publication: Publication, ref: ProtocolRef): HostOperationEvent['observation'] {
  const cp = gameCheckpoint(publication.snapshot.checkpoint);
  return { observationId: ref.id, revision: publication.wireRevision, observedAt: cp.updatedAt,
    data: { scope: 'actor', actor: { level: cp.position.level, ...cp.position.cell, facing: cp.facing, mode: cp.mode },
      source: publication.observation } };
}
