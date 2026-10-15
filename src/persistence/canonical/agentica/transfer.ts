import type { AgenticaOperationEntry } from '../../../services/agentica/sdk/agentica-host.mjs';
import { canonicalFence, type CanonicalWork } from '../transaction';
import type { CanonicalRequest } from '../types';
import { check } from '../validation';
import { loadEventAcknowledgement, loadOperationEvent } from './event.records';
import { launchPages } from './launch.records';
import { loadOperationConfirmation } from './operation.confirmation';
import { loadOperationCustodyAck } from './operation.custody';
import { operationRequest } from './operation.records';
import { operationEntry } from './operation.wire';
import { assertPublicationCurrent, readPublication } from './publication';
import { loadTransfer, loadTransferAck, transferStageKey, validateTransferAck, writeOperationRecord, writeTransferIntent } from './transfer.records';
import { transferObservation } from './transfer.wire';
import { loadTransferAdoptions } from './transfer.adoption';
import type { PreparedAction, ProtocolRef } from './types';
import { equal, snapshotPrepared, snapshotReference } from './validation';

export async function retainTransferIntent(tx: CanonicalWork, input: CanonicalRequest, action: PreparedAction, inputPublication: ProtocolRef) {
  const identity = snapshotPrepared(action), publicationRef = snapshotReference(inputPublication);
  const request = operationRequest(tx, input, 'agentica.operation.transfer', { action: identity.storageKey, publication: publicationRef });
  const pages = launchPages(tx), confirmed = await loadOperationConfirmation(pages, identity); check(confirmed, 'transfer needs original confirmation');
  const { bound } = confirmed, { operation, launch, active, progress } = bound;
  check(operation.state === 'admitted' && launch.guard.state === 'admitted' && progress.status === 'running', 'only unfinished navigation can transfer');
  check(active?.id === launch.binding.launchId && active.sourceAttemptId === launch.guard.admissionAttemptId, 'transfer launch is not active');
  const custody = await loadOperationCustodyAck(pages, identity, confirmed.reference); check(custody, 'transfer needs acknowledged original custody');
  const prior = await loadTransfer(pages, identity, confirmed);
  if (prior) check(await loadTransferAck(pages, identity, confirmed, prior), 'reconcile original transfer before another takeover');
  const latest = progress.sequence ? await loadOperationEvent(pages, identity, confirmed, progress.sequence) : null;
  let previous = prior?.data.event ?? confirmed.data.probe;
  if (latest && (!prior || progress.sequence > prior.data.navigationSequence)) {
    check(await loadEventAcknowledgement(pages, identity, confirmed, latest), 'acknowledge original progress before transfer');
    previous = latest.data.event;
  }
  const epoch = previous.nextSessionEpoch ?? previous.sessionEpoch;
  check(tx.head.epoch > Number(epoch), 'transfer needs distinct newer canonical custody');
  const publication = await readPublication(pages, publicationRef); assertPublicationCurrent(publication, tx.head);
  const observation = transferObservation(publication, request.attemptId);
  check(observation.revision >= previous.observation.revision, 'transfer cannot rewind observation');
  return writeTransferIntent(tx, request, identity, { confirmation: confirmed.reference, publication: publicationRef,
    navigationSequence: progress.sequence, previous, event: {
      hostId: launch.binding.start.hostId, sessionId: identity.action.sessionId, sessionEpoch: epoch,
      actionId: identity.action.actionId, operationId: operation.id, sequence: previous.sequence + 1, eventId: request.attemptId,
      kind: 'transfer', nextSessionEpoch: String(tx.head.epoch), observation,
      summary: 'Explicit host takeover of unfinished navigation.', usage: { steps: progress.steps, replans: progress.replans },
    } });
}

export async function retainTransferAck(tx: CanonicalWork, input: CanonicalRequest, action: PreparedAction, inputRef: ProtocolRef, remote: AgenticaOperationEntry) {
  const identity = snapshotPrepared(action), ref = snapshotReference(inputRef), entry = operationEntry(remote);
  const request = operationRequest(tx, input, 'agentica.operation.transfer-ack', { action: identity.storageKey, intent: ref, entry });
  const pages = launchPages(tx), confirmed = await loadOperationConfirmation(pages, identity); check(confirmed, 'missing transfer confirmation');
  const transfer = await loadTransfer(pages, identity, confirmed); check(transfer && equal(transfer.reference, ref), 'transfer target changed');
  validateTransferAck(entry, confirmed, transfer);
  const previous = await loadTransferAck(pages, identity, confirmed, transfer);
  if (previous) { check(equal(previous.data.entry, entry), 'original transfer ACK changed'); return { reference: previous.reference, receipt: {} }; }
  return writeOperationRecord(tx, request, transferStageKey(ref, 'ack'), 'agentica-transfer-ack', { intent: ref, entry });
}

export async function retainTransferAuthority(tx: CanonicalWork, input: CanonicalRequest, action: PreparedAction, inputRef: ProtocolRef) {
  const identity = snapshotPrepared(action), ref = snapshotReference(inputRef);
  const request = operationRequest(tx, input, 'agentica.operation.transfer-authorize', { action: identity.storageKey, intent: ref });
  const pages = launchPages(tx), confirmed = await loadOperationConfirmation(pages, identity); check(confirmed, 'missing transfer confirmation');
  const transfer = await loadTransfer(pages, identity, confirmed); check(transfer && equal(transfer.reference, ref), 'transfer target changed');
  const ack = await loadTransferAck(pages, identity, confirmed, transfer); check(ack, 'transfer needs exact service ACK');
  const { operation, launch, active, progress } = confirmed.bound;
  const fence = canonicalFence(tx.head);
  check(fence.owner === transfer.source.expected.owner && fence.epoch === transfer.source.expected.epoch, 'transfer custody superseded');
  check(active?.id === launch.binding.launchId && active.sourceAttemptId === launch.guard.admissionAttemptId
    && progress.status === 'running' && progress.sequence === transfer.data.navigationSequence
    && [operation, launch.guard].every(o => o.state === 'admitted' && o.owner === fence.owner && o.epoch === fence.epoch && o.revision > ack.row.revision),
  'transfer requires kernel guard and navigation adoption after ACK');
  const adopted = await loadTransferAdoptions(pages, confirmed, transfer, ack.row.revision);
  check(launch.guard.revision === adopted.guard.receipt.afterRevision && operation.revision === adopted.navigation.receipt.afterRevision,
    'kernel rows do not match explicit transfer adoption receipts');
  assertPublicationCurrent(transfer.publication, tx.head);
  return writeOperationRecord(tx, request, transferStageKey(ref, 'authority'), 'agentica-transfer-authority',
    { intent: ref, guardRevision: launch.guard.revision, operationRevision: operation.revision,
      guardAdoption: adopted.guard.source.attemptId, navigationAdoption: adopted.navigation.source.attemptId });
}
