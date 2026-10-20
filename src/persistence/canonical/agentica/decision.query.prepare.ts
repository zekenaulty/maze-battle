import { actionResult, captureBinding, type ActionBinding } from '../../../services/agentica/game/actionContract';
import { MAX_OBSERVATION_BYTES } from '../../../services/agentica/game/types';
import { canonicalFence } from '../transaction';
import type { CanonicalHead } from '../types';
import { fields } from '../roster/codec';
import { check } from '../validation';
import { assertLaunchGrant } from './launch.grant';
import { launchPages } from './launch.records';
import type { LaunchGrantContext } from './launch.types';
import { eventKey } from './event.records';
import { MAX_RESULT_BYTES, type PreparedAction } from './types';
import { equal, snapshotJson, snapshotPrepared } from './validation';
import { decisionPages, DecisionQueryRefusal, readPreviousDecision } from './decision.query.read';
import { decisionQueryData, decisionQueryProof, type DecisionQueryProof } from './decision.query.proof';
import { readDecisionObservation, type DecisionObservationSource } from './decision.query.source';

const prepared = new WeakMap<DecisionQueryProof, string>();
const signature = (proof: DecisionQueryProof, identity: PreparedAction, head: CanonicalHead) =>
  JSON.stringify([proof, identity.fingerprint, canonicalFence(head)]);
export function snapshotPreparedDecision(proof: DecisionQueryProof, identity: PreparedAction, head: CanonicalHead) {
  check(prepared.get(proof) === signature(proof, identity, head), 'decision evidence was not prepared for this action and state');
  return decisionQueryProof(proof);
}

/** Explicit one-predecessor history query. Current observation/publication and retained wakes stay untouched. */
export async function queryDecision(tx: LaunchGrantContext, input: PreparedAction, inputBinding: ActionBinding) {
  const identity = snapshotPrepared(input), binding = captureBinding(inputBinding), head = snapshotJson(tx.head);
  const args = fields(identity.action.arguments, 'scope');
  check(identity.action.capabilityId === 'maze.inspect' && args.scope === 'decision', 'not a decision inspection');
  const bounded = decisionPages(launchPages(tx)), pages = bounded.pages;
  const grant = await assertLaunchGrant({ head, pages, liveOperation: pages.liveOperation }, binding.grant, identity.action, binding.publication);
  const cap = grant.capability;
  check(cap.kind === 'query' && cap.effect === 'readOnly' && cap.durableHandoff !== true
    && cap.inputSchema.fields.every(f => !f.required || Object.hasOwn(args, f.name))
    && cap.inputSchema.fields.some(f => f.name === 'scope' && f.type === 'string' && f.allowedValues?.includes('decision')),
  'decision inspection was not granted');
  const intent = await readPreviousDecision(pages, binding.grant);
  let previous: DecisionQueryProof['previous'] = null;
  if (intent) {
    const terminal = intent.terminal, transfer = terminal.transfer;
    let observation: DecisionObservationSource;
    if (transfer && terminal.bound.progress.sequence <= transfer.data.navigationSequence)
      observation = { kind: 'transfer', reference: transfer.reference };
    else if (terminal.bound.progress.sequence) {
      const key = eventKey(intent.identity, terminal.bound.progress.sequence), row = await pages.get('execution', key);
      check(row, 'missing historical progress observation');
      observation = { kind: 'progress', reference: { key, id: row.id } };
    } else {
      check(terminal.confirmed, 'missing historical confirmation');
      observation = { kind: 'probe', reference: terminal.confirmed.reference };
    }
    const source = await readDecisionObservation(pages, observation, intent.identity.storageKey);
    check(equal(source.event.observation, terminal.event.observation), 'historical observation does not match original terminal');
    previous = { intent: intent.reference, observation };
  }
  const proof = decisionQueryProof({ schema: 1, grant: binding.grant, previous });
  const { receipt } = await pages.sourceReceipt(grant.publication.sourceAttemptId);
  const observation = { observationId: binding.publication.id, revision: grant.publication.wireRevision,
    observedAt: receipt.committedAt, data: decisionQueryData(intent?.terminal.event ?? null) };
  const result = actionResult(identity, observation, intent ? 'Original predecessor decision; historical evidence only.' : 'No predecessor decision in this initial window.');
  if (new TextEncoder().encode(JSON.stringify(result.observation)).length > MAX_OBSERVATION_BYTES
    || new TextEncoder().encode(JSON.stringify(result)).length > MAX_RESULT_BYTES)
    throw new DecisionQueryRefusal('Historical decision exceeds the query envelope; no evidence was truncated.');
  prepared.set(proof, signature(proof, identity, head));
  return { result, proof };
}
