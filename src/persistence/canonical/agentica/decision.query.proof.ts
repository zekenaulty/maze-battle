import type { AgenticaResult } from '../../../services/agentica/contracts';
import type { HostOperationEvent } from '../../../services/agentica/sdk/agentica-host.mjs';
import { fields } from '../roster/codec';
import { check, jsonBytes } from '../validation';
import type { loadOriginalAction } from './actions.original';
import type { DecisionIntent } from './decision.records';
import { loadLaunchRecord } from './launch.records';
import type { LaunchGrant } from './launch.types';
import { loadOperationRecord } from './operation.records';
import { MAX_EVENT_BYTES } from './operation.types';
import type { SuccessorGrant } from './run-grant.types';
import type { PreparedAction, ProtocolRead, ProtocolRef } from './types';
import { equal, snapshotJson, snapshotPrepared, snapshotReference } from './validation';
import { readDecisionObservation, type DecisionObservationSource } from './decision.query.source';

export interface DecisionQueryProof {
  schema: 1; grant: ProtocolRef;
  previous: { intent: ProtocolRef; observation: DecisionObservationSource } | null;
}
export function decisionQueryProof(input: unknown): DecisionQueryProof {
  const value = snapshotJson(input, 2048), row = fields(value, 'schema grant previous');
  check(row.schema === 1, 'invalid decision query proof'); snapshotReference(row.grant as unknown as ProtocolRef);
  if (row.previous !== null) {
    const previous = fields(row.previous, 'intent observation'), observation = fields(previous.observation, 'kind reference');
    snapshotReference(previous.intent as unknown as ProtocolRef); snapshotReference(observation.reference as unknown as ProtocolRef);
    check(['progress', 'transfer', 'probe'].includes(observation.kind as string), 'invalid decision observation source');
  }
  return value as DecisionQueryProof;
}
export const decisionQueryData = (event: HostOperationEvent | null) => event
  ? { scope: 'decision', state: 'historical', event }
  : { scope: 'decision', state: 'unavailable', reason: 'initial-window' };

/** Replay reads immutable grant, intent, observation and settle receipts, not current live authority. */
export async function historicalDecision(pages: ProtocolRead, input: DecisionQueryProof,
  inputIdentity: PreparedAction, inputPending: NonNullable<Awaited<ReturnType<typeof loadOriginalAction>>>) {
  const proof = decisionQueryProof(input), identity = snapshotPrepared(inputIdentity), pending = snapshotJson(inputPending);
  const immutable = {
    get: (area: Parameters<ProtocolRead['get']>[0], key: string) => pages.get(area, key),
    sourceReceipt: (id: string) => pages.sourceReceipt(id),
    savedSnapshot: (key: string) => pages.savedSnapshot(key),
    liveOperation: async () => { throw Error('Historical query cannot read live operations'); },
  };
  const original = fields(pending.original.sourceRequest.input, 'action grant publication');
  check(original.action === identity.storageKey && equal(original.grant, proof.grant)
    && equal(original.publication, pending.original.publication), 'decision query original grant changed');
  const grant = await loadLaunchRecord<LaunchGrant | SuccessorGrant>(immutable, proof.grant.key,
    proof.previous ? 'agentica-successor-grant' : 'agentica-launch-grant', proof.grant);
  check(grant && grant.row.revision <= pending.original.sourceRequest.expected.revision
    && grant.source.expected.gameId === pending.publication.snapshot.gameId
    && grant.source.expected.generation === pending.publication.snapshot.generation
    && grant.value.data.owner === pending.original.owner && grant.value.data.epoch === pending.original.epoch,
  'decision query grant custody changed');
  if (!proof.previous) return null;
  const g = grant.value.data as SuccessorGrant, ref = proof.previous.intent;
  check(equal(g.intent, ref) && g.original.key === g.action
    && ref.key === `agentica/operations/${g.action.slice(-64)}/decision`, 'historical intent is outside grant');
  const intent = await loadOperationRecord<DecisionIntent>(immutable, ref.key, 'agentica-decision-intent', ref);
  check(intent && intent.row.revision < grant.row.revision && intent.source.operation === 'agentica.operation.decision'
    && equal(intent.source.input, { action: g.action, binding: g.binding, publication: g.publication })
    && equal(intent.data.binding, g.binding) && equal(intent.data.publication, g.publication), 'historical intent source changed');
  const prior = await readDecisionObservation(pages, proof.previous.observation, g.action);
  const { source, receipt } = await pages.sourceReceipt(intent.data.terminalAttemptId);
  const event = snapshotJson({ ...intent.data.event, eventId: intent.data.terminalAttemptId, observation: prior.event.observation });
  jsonBytes(event, MAX_EVENT_BYTES);
  check(source.operation === 'operation.settle' && (source.input as { operationId: string }).operationId === event.operationId
    && receipt.afterRevision < intent.row.revision && prior.revision <= receipt.beforeRevision
    && source.expected.gameId === grant.source.expected.gameId && source.expected.generation === grant.source.expected.generation
    && prior.source.expected.gameId === source.expected.gameId && prior.source.expected.generation === source.expected.generation
    && event.kind === 'decision' && event.hostId === prior.event.hostId && event.sessionId === prior.event.sessionId
    && event.sessionEpoch === (prior.event.nextSessionEpoch ?? prior.event.sessionEpoch)
    && event.actionId === prior.event.actionId && event.operationId === prior.event.operationId
    && event.sequence === prior.event.sequence + 1, 'historical terminal source changed');
  return event;
}

export async function validateDecisionQueryResult(pages: ProtocolRead, input: unknown, inputIdentity: PreparedAction,
  inputPending: NonNullable<Awaited<ReturnType<typeof loadOriginalAction>>>, inputResult: AgenticaResult) {
  const identity = snapshotPrepared(inputIdentity), pending = snapshotJson(inputPending), result = snapshotJson(inputResult);
  if (identity.action.capabilityId !== 'maze.inspect' || identity.action.arguments.scope !== 'decision' || result.disposition !== 'applied') {
    check(input === undefined, 'unexpected decision query proof'); return undefined;
  }
  fields(identity.action.arguments, 'scope');
  const proof = decisionQueryProof(input), event = await historicalDecision(pages, proof, identity, pending);
  check(result.operation === undefined && result.completion === undefined
    && equal(result.observation?.data, decisionQueryData(event)), 'decision query result differs from historical evidence');
  return proof;
}
