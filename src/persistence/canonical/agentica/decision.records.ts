import type { HostDecisionAdoption, HostOperationEvent } from '../../../services/agentica/sdk/agentica-host.mjs';
import { fields } from '../roster/codec';
import { check, jsonBytes, validId } from '../validation';
import { gameCheckpoint } from '../game/checkpoint';
import { captureOperationBinding } from './operation.binding';
import { loadOperationRecord, operationKey } from './operation.records';
import type { OperationBinding, OperationRead } from './operation.types';
import { readPublication } from './publication';
import { loadAgenticaTerminal } from './terminal';
import type { PreparedAction, ProtocolRef, Publication } from './types';
import { equal, snapshotPrepared } from './validation';

export interface DecisionIntent {
  binding: OperationBinding; confirmation: ProtocolRef; publication: ProtocolRef;
  terminalAttemptId: string; event: HostOperationEvent; adoption: HostDecisionAdoption | null;
}
export const decisionKey = (identity: PreparedAction) => operationKey(identity, 'decision');

function decisionObservation(publication: Publication, attemptId: string): HostOperationEvent['observation'] {
  const cp = gameCheckpoint(publication.snapshot.checkpoint);
  const observationId = `decision-${attemptId}`; check(validId(observationId), 'invalid decision observation identity');
  return { observationId, revision: publication.wireRevision, observedAt: cp.updatedAt,
    data: { scope: 'actor', actor: { level: cp.position.level, ...cp.position.cell, facing: cp.facing, mode: cp.mode },
      source: publication.observation },
  };
}
export function decisionEvent(publication: Publication, terminal: HostOperationEvent, attemptId: string): HostOperationEvent {
  return String(publication.epoch) === terminal.sessionEpoch
    ? { ...terminal, eventId: attemptId, observation: decisionObservation(publication, attemptId) } : terminal;
}
export function decisionAdoption(publication: Publication, event: HostOperationEvent, attemptId: string): HostDecisionAdoption | null {
  check(publication.epoch >= Number(event.sessionEpoch), 'decision publication rewinds custody');
  if (String(publication.epoch) === event.sessionEpoch) return null;
  return { adoptionId: attemptId, nextSessionEpoch: String(publication.epoch), observation: decisionObservation(publication, attemptId) };
}

/** Read-only original intention. A reload does not adopt, refresh perception, or create another wake. */
export async function loadDecisionIntent(pages: OperationRead, input: PreparedAction) {
  const identity = snapshotPrepared(input);
  const record = await loadOperationRecord<DecisionIntent>(pages, decisionKey(identity), 'agentica-decision-intent');
  if (!record) return null;
  const d = record.data; fields(d, 'binding confirmation publication terminalAttemptId event adoption');
  jsonBytes(d, 6 * 1024); const binding = captureOperationBinding(d.binding);
  const terminal = await loadAgenticaTerminal(pages, identity, binding);
  check(terminal?.event.kind === 'decision' && terminal.confirmed && terminal.terminal.disposition === 'completed',
    'decision requires completed retained navigation');
  check(record.source.operation === 'agentica.operation.decision' && equal(record.source.input,
    { action: identity.storageKey, binding, publication: d.publication })
    && equal(d.confirmation, terminal.confirmed.reference)
    && d.terminalAttemptId === terminal.terminal.terminal.source.attemptId
    && record.row.revision > terminal.terminal.terminal.receipt.afterRevision, 'decision terminal source changed');
  const publication = await readPublication(pages, d.publication), f = record.source.expected;
  check(publication.owner === f.owner && publication.epoch === f.epoch
    && publication.snapshot.gameId === f.gameId && publication.snapshot.generation === f.generation
    && publication.wireRevision <= f.revision && publication.wireRevision >= terminal.event.observation.revision
    && equal(d.event, decisionEvent(publication, terminal.event, record.source.attemptId))
    && equal(d.adoption, decisionAdoption(publication, d.event, record.source.attemptId)), 'decision publication source changed');
  return { ...record, identity, terminal, publication };
}
export type RetainedDecision = NonNullable<Awaited<ReturnType<typeof loadDecisionIntent>>>;
