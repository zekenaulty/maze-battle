import { canonicalFence, type CanonicalWork } from '../transaction';
import type { CanonicalHead } from '../types';
import { snapshotOf } from '../read';
import { fields } from '../roster/codec';
import { check } from '../validation';
import { assertLaunchGrant } from './launch.grant';
import { readReturnEvidence } from './objective.evidence';
import { objectiveProof, type ObjectiveProof } from './objective.proof';
import { snapshotJson, snapshotPrepared, snapshotReference } from './validation';
import type { PreparedAction, ProtocolRef } from './types';

export class ObjectiveRefusal extends Error {}
const prepared = new WeakMap<ObjectiveProof, string>();
const signature = (proof: ObjectiveProof, identity: PreparedAction, head: CanonicalHead) =>
  JSON.stringify([proof, identity.fingerprint, canonicalFence(head)]);

export function snapshotPreparedObjective(proof: ObjectiveProof, identity: PreparedAction, head: CanonicalHead) {
  check(prepared.get(proof) === signature(proof, identity, head), 'objective evidence was not prepared for this action and state');
  return objectiveProof(proof);
}
export async function prepareObjectiveProof(tx: CanonicalWork, identity: PreparedAction,
  input: { publication: ProtocolRef; grant: ProtocolRef }) {
  identity = snapshotPrepared(identity);
  const binding = { publication: snapshotReference(input.publication), grant: snapshotReference(input.grant) };
  const head = snapshotJson(tx.head), args = fields(identity.action.arguments, 'scope');
  check(identity.action.capabilityId === 'maze.inspect' && args.scope === 'objective', 'not an objective inspection');
  const grant = await assertLaunchGrant({ ...tx, head }, binding.grant, identity.action, binding.publication), cap = grant.capability;
  check(cap.effect === 'readOnly' && cap.kind === 'query' && cap.durableHandoff !== true
    && cap.inputSchema.fields.every(f => !f.required || Object.hasOwn(identity.action.arguments, f.name))
    && cap.inputSchema.fields.some(f => f.name === 'scope' && f.type === 'string' && f.allowedValues?.includes('objective')),
  'objective inspection was not granted');
  if (!grant.objective) throw new ObjectiveRefusal('This launch has no owner-selected return objective.');
  const objective = snapshotJson(grant.objective.value);
  const evidence = await readReturnEvidence(tx.pages, snapshotOf(head), objective);
  const proof = objectiveProof({ schema: 1, publication: grant.objective.publication, grant: binding.grant,
    admissionAttemptId: grant.objective.admissionAttemptId, evidence });
  prepared.set(proof, signature(proof, identity, head));
  return { objective, proof };
}
