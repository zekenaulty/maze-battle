import type { AgenticaResult } from '../../../services/agentica/contracts';
import { fields } from '../roster/codec';
import { check, jsonBytes, validId } from '../validation';
import { gameCheckpoint } from '../game/checkpoint';
import { same } from '../world/records';
import { contentKey } from '../content/records';
import { readPublication } from './publication';
import { launchBinding, launchGuardId, launchSessionId } from './launch.validation';
import { returnObjective, type ReturnObjective } from './objective.binding';
import { returnEvidence, returnSatisfied, type ReturnEvidence } from './objective.evidence';
import { equal, snapshotJson, snapshotReference } from './validation';
import type { PreparedAction, ProtocolRead, ProtocolRef } from './types';
import type { loadOriginalAction } from './actions.original';

export interface ObjectiveProof {
  schema: 1; publication: ProtocolRef; grant: ProtocolRef; admissionAttemptId: string; evidence: ReturnEvidence;
}
export function objectiveProof(input: unknown): ObjectiveProof {
  jsonBytes(input, 4096);
  const row = fields(input, 'schema publication grant admissionAttemptId evidence');
  check(row.schema === 1 && validId(row.admissionAttemptId), 'invalid objective proof');
  snapshotReference(row.publication as unknown as ProtocolRef); snapshotReference(row.grant as unknown as ProtocolRef);
  returnEvidence(row.evidence);
  return snapshotJson(input) as ObjectiveProof;
}
export function objectiveData(objective: ReturnObjective, proof: ObjectiveProof) {
  return { scope: 'objective', kind: 'retrieve-return', objectiveId: objective.objectiveId, title: objective.quest.title,
    itemName: objective.quest.item.displayName, carried: proof.evidence.quest.packCount,
    questStatus: proof.evidence.quest.status, atReturn: proof.evidence.arrival !== null,
    status: returnSatisfied(proof.evidence) ? 'satisfied' : 'pending',
    returnTo: { level: objective.entrance.at.level, ...objective.entrance.at.cell } };
}
export function objectiveCompletion(objective: ReturnObjective, proof: ObjectiveProof, evidenceId: string) {
  return returnSatisfied(proof.evidence) ? { objectiveId: objective.objectiveId, evidenceId,
    summary: 'Selected quest item is carried at the earned town entrance.' } : undefined;
}

/** Replay validates retained source receipts, never today's quest, inventory, sight or live grant. */
export async function validateObjectiveResult(pages: ProtocolRead, input: unknown, identity: PreparedAction,
  pending: NonNullable<Awaited<ReturnType<typeof loadOriginalAction>>>, result: AgenticaResult) {
  if (identity.action.capabilityId !== 'maze.inspect' || identity.action.arguments.scope !== 'objective'
    || result.disposition !== 'applied') {
    check(input === undefined && result.completion === undefined, 'unexpected host objective proof or completion');
    return undefined;
  }
  const args = fields(identity.action.arguments, 'scope'); check(args.scope === 'objective', 'invalid objective inspection');
  const proof = objectiveProof(input), root = await readPublication(pages, proof.publication);
  check(root.objective, 'missing bound host objective');
  const objective = returnObjective(root.objective);
  const { source } = await pages.sourceReceipt(proof.admissionAttemptId);
  const admission = fields(source.input, 'operationId binding terminalBytes ackPolicy'), binding = launchBinding(admission.binding);
  check(source.operation === 'operation.admit' && admission.ackPolicy === 'verified-host'
    && admission.operationId === launchGuardId(objective.launchId) && binding.launchId === objective.launchId
    && binding.start.objectiveId === objective.objectiveId && equal(binding.publication, proof.publication)
    && source.expected.generation === root.snapshot.generation && source.expected.gameId === root.snapshot.gameId
    && root.owner === source.expected.owner && root.epoch === source.expected.epoch
    && root.snapshot.revision <= source.expected.revision
    && source.expected.revision < pending.original.sourceRequest.expected.revision,
  'objective root admission changed');
  const original = fields(pending.original.sourceRequest.input, 'action grant publication');
  check(original.action === identity.storageKey && equal(original.grant, proof.grant)
    && equal(original.publication, pending.original.publication), 'objective action grant changed');
  const e = proof.evidence, snapshot = pending.publication.snapshot, checkpoint = gameCheckpoint(snapshot.checkpoint);
  check(root.snapshot.generation === snapshot.generation && root.snapshot.gameId === snapshot.gameId
    && e.generation === snapshot.generation && e.gameId === snapshot.gameId
    && identity.action.sessionId === launchSessionId(snapshot.gameId, objective.launchId)
    && e.quest.quest.key === contentKey('quest', objective.quest.questId) && e.quest.floor === 1,
  'objective evidence identity changed');
  if (e.arrival) check(checkpoint.mode === 'manual' && same(checkpoint.position, objective.entrance.at)
    && e.arrival.sequence === checkpoint.knowledge?.sequence && e.arrival.id === checkpoint.knowledge?.id,
  'objective arrival is outside its publication');
  check(equal(result.observation?.data, objectiveData(objective, proof))
    && equal(result.completion ?? null, objectiveCompletion(objective, proof, result.evidenceId) ?? null),
  'objective result differs from retained evidence');
  return proof;
}
