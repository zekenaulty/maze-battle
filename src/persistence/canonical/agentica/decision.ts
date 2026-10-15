import type { CanonicalWork } from '../transaction';
import type { CanonicalRequest } from '../types';
import { check, jsonBytes } from '../validation';
import { launchPages } from './launch.records';
import { captureOperationBinding } from './operation.binding';
import { operationRequest, writeOperationRecord } from './operation.records';
import type { OperationBinding } from './operation.types';
import { assertPublicationCurrent, readPublication } from './publication';
import { loadAgenticaTerminal } from './terminal';
import { decisionAdoption, decisionEvent, decisionKey, loadDecisionIntent, type DecisionIntent } from './decision.records';
import type { PreparedAction, ProtocolRef } from './types';
import { equal, snapshotPrepared, snapshotReference } from './validation';

/** Explicit host decision before any service wake. It grants no action or kernel adoption authority. */
export async function retainDecisionIntent(tx: CanonicalWork, input: CanonicalRequest, action: PreparedAction,
  inputBinding: OperationBinding, inputPublication: ProtocolRef) {
  const identity = snapshotPrepared(action), binding = captureOperationBinding(inputBinding), publicationRef = snapshotReference(inputPublication);
  const request = operationRequest(tx, input, 'agentica.operation.decision', { action: identity.storageKey, binding, publication: publicationRef });
  const pages = launchPages(tx), terminal = await loadAgenticaTerminal(pages, identity, binding);
  check(terminal?.event.kind === 'decision' && terminal.confirmed && terminal.bound.operation.state === 'settled',
    'decision requires unacknowledged completed navigation');
  const { launch, active } = terminal.bound;
  check(launch.guard.state === 'admitted' && active?.id === launch.binding.launchId
    && active.sourceAttemptId === launch.guard.admissionAttemptId, 'decision launch is no longer active');
  const publication = await readPublication(pages, publicationRef); assertPublicationCurrent(publication, tx.head);
  check(publication.wireRevision >= terminal.event.observation.revision, 'decision cannot rewind observation');
  const existing = await loadDecisionIntent(pages, identity);
  if (existing) {
    check(equal(existing.data.binding, binding) && equal(existing.data.publication, publicationRef)
      && existing.source.expected.owner === tx.head.owner && existing.source.expected.epoch === tx.head.epoch,
    'reconcile original decision before another wake');
    return { reference: existing.reference, receipt: { reference: existing.reference } };
  }
  const adoption = decisionAdoption(publication, terminal.event, request.attemptId);
  if (!adoption) check(launch.guard.owner === tx.head.owner && launch.guard.epoch === tx.head.epoch,
    'same-epoch decision requires current launch custody');
  const data: DecisionIntent = { binding, confirmation: terminal.confirmed.reference, publication: publicationRef,
    terminalAttemptId: terminal.terminal.terminal.source.attemptId, event: decisionEvent(publication, terminal.event, request.attemptId), adoption };
  jsonBytes(data, 6 * 1024);
  return writeOperationRecord(tx, request, decisionKey(identity), 'agentica-decision-intent', data);
}
