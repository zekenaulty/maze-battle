import { loadObservation, validateKnowledge } from '../knowledge/evidence';
import type { NavigationHostHooks, NavigationPreparation } from '../navigation/host';
import type { CanonicalRequest, Json } from '../types';
import { check, jsonBytes, request as validateRequest } from '../validation';
import { assertEffectiveOperationCustody } from './authority';
import { loadOperationConfirmation } from './operation.confirmation';
import { loadOperationCustodyAck } from './operation.custody';
import { eventKey, loadEventAcknowledgement, loadOperationEvent } from './event.records';
import { MAX_EVENT_BYTES, type OperationEvent, type OperationPredecessor, type OperationRead } from './operation.types';
import type { PreparedAction, ProtocolRef } from './types';
import { equal, snapshotJson, snapshotPrepared, snapshotReference } from './validation';

function reader(view: NavigationPreparation): OperationRead {
  const { getExecution, savedSnapshot, sourceReceipt, liveOperation } = view;
  return { get: (area, key) => { check(area === 'execution', 'operation reader cannot read hidden world'); return getExecution(key); },
    savedSnapshot, sourceReceipt, liveOperation };
}
/** Only navigation.advance. Admission uses navigationActionHooks instead. Arrived/blocked progress does not settle the kernel operation. */
export function operationProgressHooks(input: PreparedAction, inputConfirmation: ProtocolRef): NavigationHostHooks {
  const identity = snapshotPrepared(input), confirmation = snapshotReference(inputConfirmation);
  let prepared: { request: CanonicalRequest; sequence: number; wireSequence: number; epoch: string; authority?: ProtocolRef;
    previous: OperationPredecessor; custody: ProtocolRef; hostId: string } | undefined;
  return {
    async prepare(view) {
      prepared = undefined;
      const request = validateRequest(view.request), head = snapshotJson(view.head), operation = snapshotJson(view.operation);
      const pages = reader(view), confirmed = await loadOperationConfirmation(pages, identity, confirmation); check(confirmed, 'missing service confirmation');
      const { bound } = confirmed, sequence = bound.progress.sequence;
      check(request.operation === 'navigation.advance' && equal(request.input, { operationId: confirmed.data.operationId, sequence })
        && equal(operation, bound.operation), 'progress command differs from confirmed operation');
      const authority = await assertEffectiveOperationCustody(pages, head, identity, confirmed);
      const custody = await loadOperationCustodyAck(pages, identity, confirmation); check(custody, 'custody probe is not acknowledged');
      let previous: OperationPredecessor = { kind: 'custody-probe', reference: confirmation };
      if (authority && sequence === authority.transfer.data.navigationSequence) {
        previous = { kind: 'transfer', reference: authority.transfer.reference };
      } else if (sequence > 0) {
        const event = await loadOperationEvent(pages, identity, confirmed, sequence);
        check(event.source.attemptId === bound.progress.sourceAttemptId, 'latest progress lacks its original event');
        check(await loadEventAcknowledgement(pages, identity, confirmed, event), 'previous event is not acknowledged');
        previous = { kind: 'progress', reference: event.reference };
      }
      prepared = { request, sequence, previous, custody: custody.reference, hostId: bound.launch.binding.start.hostId,
        wireSequence: authority ? authority.transfer.data.event.sequence + sequence - authority.transfer.data.navigationSequence + 1 : sequence + 2,
        epoch: String(head.epoch), ...(authority ? { authority: authority.reference } : {}) };
    },
    async commit(view) {
      const request = validateRequest(view.request), head = snapshotJson(view.head), p = snapshotJson(view.progress), cp = snapshotJson(view.checkpoint);
      const ready = prepared; prepared = undefined;
      check(ready && equal(ready.request, request) && p.sequence === ready.sequence + 1 && p.sourceAttemptId === request.attemptId
        && p.operationId === view.operation.id && equal(p.position, cp.position), 'event was not prepared for this progress');
      await validateKnowledge(view.knowledge, cp.knowledge);
      const sight = cp.knowledge ? await loadObservation(view.knowledge, { sequence: cp.knowledge.sequence, id: cp.knowledge.id }) : null;
      const data: OperationEvent = { confirmation, custody: ready.custody, previous: ready.previous,
        ...(ready.authority ? { authority: ready.authority } : {}), event: {
        hostId: ready.hostId, sessionId: identity.action.sessionId, sessionEpoch: ready.epoch,
        actionId: identity.action.actionId, operationId: p.operationId, sequence: ready.wireSequence, eventId: request.attemptId, kind: 'progress',
        observation: { observationId: `event-${request.attemptId}`, revision: head.revision + 1,
          observedAt: sight?.header.observedAt ?? cp.updatedAt, data: {
            scope: 'actor', actor: { level: cp.position.level, ...cp.position.cell, facing: cp.facing, mode: cp.mode },
            source: sight ? { sequence: cp.knowledge!.sequence, id: cp.knowledge!.id, revision: sight.header.revision } : null,
            navigation: { sequence: p.sequence, steps: p.steps, status: p.status, reason: p.reason },
          } }, summary: `Navigation ${p.status}; ${p.steps} steps.`, usage: { steps: p.steps },
      } };
      jsonBytes(data.event, MAX_EVENT_BYTES);
      const event = await view.appendExecution(eventKey(identity, p.sequence), snapshotJson({ schema: 1,
        kind: 'agentica-operation-event', sourceAttemptId: request.attemptId, data }) as unknown as Json);
      return { event };
    },
  };
}
