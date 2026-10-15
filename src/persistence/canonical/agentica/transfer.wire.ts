import type { HostOperationEvent } from '../../../services/agentica/sdk/agentica-host.mjs';
import { gameCheckpoint } from '../game/checkpoint';
import { check, validId } from '../validation';
import type { Publication } from './types';

export function transferObservation(publication: Publication, attemptId: string): HostOperationEvent['observation'] {
  const cp = gameCheckpoint(publication.snapshot.checkpoint);
  const observationId = `transfer-${attemptId}`;
  check(validId(observationId), 'invalid transfer observation identity');
  return { observationId, revision: publication.wireRevision, observedAt: cp.updatedAt,
    data: { scope: 'actor', actor: { level: cp.position.level, ...cp.position.cell, facing: cp.facing, mode: cp.mode },
      source: publication.observation } };
}
