import type { CanonicalWork } from '../../../persistence/canonical/transaction';
import type { PreparedAction } from '../../../persistence/canonical/agentica/types';
import { prepareObjectiveProof } from '../../../persistence/canonical/agentica/objective.prepare';
import { objectiveCompletion, objectiveData } from '../../../persistence/canonical/agentica/objective.proof';
import { readPublication } from '../../../persistence/canonical/agentica/publication';
import { jsonBytes } from '../../../persistence/canonical/validation';
import { actionResult, captureBinding, type ActionBinding } from './actionContract';
import { MAX_OBSERVATION_BYTES } from './types';

/** Explicit player-equivalent objective check; no interaction, navigation, reward, or new sight. */
export async function queryObjective(tx: CanonicalWork, identity: PreparedAction, input: ActionBinding) {
  const binding = captureBinding(input);
  const { objective, proof } = await prepareObjectiveProof(tx, identity, binding);
  const publication = await readPublication(tx.pages, binding.publication);
  const { receipt } = await tx.pages.sourceReceipt(publication.sourceAttemptId);
  const observation = { observationId: binding.publication.id, revision: publication.wireRevision,
    observedAt: receipt.committedAt, data: objectiveData(objective, proof) };
  jsonBytes(observation, MAX_OBSERVATION_BYTES);
  const result = actionResult(identity, observation, 'Selected return objective checked against game-owned evidence.');
  const completion = objectiveCompletion(objective, proof, result.evidenceId);
  return { result: { ...result, ...(completion ? { completion } : {}) }, proof };
}
