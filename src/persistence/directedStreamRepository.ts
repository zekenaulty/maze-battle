import { stopDestinationOperation } from '../domain/directed/destinationExecution';
import { cancelDirectedStreamTravel, sameDirectedFrame, settleDirectedStreamMove } from '../domain/expedition/streaming/directed/execution';
import type { StreamDestination } from '../domain/expedition/streaming/directed/types';
import type { StreamControl } from '../domain/expedition/streaming/types';
import { prepareDirectedStreamStep, startDirectedStreamTravel } from '../services/expedition/directed/adapter';
import { executeStreamActionInTransaction } from './streamActions';
import { savedStreamKnowledge, streamControl, streamRecord } from './streamRecords';
import { streamCheck, validateStreamControl } from './streamValidation';
import type { StreamGeometryReader } from './streamTypes';
import { topologyTransaction, type TopologyTransaction } from './topology/database';
import { validId } from './topology/validation';
import { directedRecordAt, reconcileDirectedAt, retireDirectedPending, revokeDirectedAt, sameStreamControl, writeDirectedRecord } from './directedStreamRecords';
import type { DirectedStreamSession, StoredDirectedStreamOperation } from './directedStreamTypes';
import { configuredDestinationLimits } from '../config/directedTravel';
import { destinationExpired, snapshotDestinationLimits, exceedsLimit, limitReached, type DestinationLimits } from '../domain/directed/destinationLimits';
import { loadDirectedStreamKnowledge } from '../services/expedition/directed/knowledge';

export async function loadDirectedStreamSession(slot: string, operationId?: string): Promise<DirectedStreamSession> {
  validId(slot);
  return topologyTransaction(async tx => {
    const { checkpoint } = await streamRecord(tx, slot);
    const control = await streamControl(tx, slot);
    streamCheck(control, 'stream control is missing');
    const { record } = await directedRecordAt(tx, slot, checkpoint, operationId);
    return { checkpoint, control, record };
  });
}

/** Explicit open/takeover, not slot creation. Existing intentions always reload paused. */
export async function openDirectedStreamSession(slot: string, sessionId: string): Promise<DirectedStreamSession> {
  validId(slot); validId(sessionId);
  return topologyTransaction(async tx => {
    const { root, checkpoint } = await streamRecord(tx, slot);
    const { record } = await directedRecordAt(tx, slot, checkpoint);
    if (record) await reconcileDirectedAt(tx, slot, record, checkpoint);
    const control = await revokeDirectedAt(tx, slot, sessionId);
    if (record) {
      retireDirectedPending(record, 'Paused after reload. Select a destination to travel again.');
      await writeDirectedRecord(tx, slot, record);
    } else await tx.stageRoot(slot, root);
    return { checkpoint, control, record };
  });
}

export async function startDurableDirectedStreamTravel(slot: string, owner: StreamControl,
  input: { id: string; target: StreamDestination }, now: () => number = Date.now, limits?: DestinationLimits) {
  const token = structuredClone(owner), intent = structuredClone(input);
  const policy = limits === undefined ? undefined : snapshotDestinationLimits(limits);
  return topologyTransaction(tx => startDurableDirectedStreamTravelInTransaction(tx, slot, token, intent, now, policy));
}

export async function startDurableDirectedStreamTravelInTransaction(tx: TopologyTransaction, slot: string, owner: StreamControl,
  input: { id: string; target: StreamDestination }, now: () => number = Date.now, limits?: DestinationLimits, admissionOnly = false) {
  validId(slot); validId(input.id); validateStreamControl(owner);
  const intent = structuredClone(input), token = structuredClone(owner);
  const policy = limits === undefined ? undefined : snapshotDestinationLimits(limits);
  const { root, checkpoint } = await streamRecord(tx, slot);
  const control = await streamControl(tx, slot);
  streamCheck(sameStreamControl(control, token), 'directed owner changed');
  const active = (await directedRecordAt(tx, slot, checkpoint)).record;
  streamCheck(!active?.state.pending && (!active || active.state.paused || active.state.operation.status !== 'running'), 'cancel the active intention first');
  streamCheck(await tx.get('directedStreamOperations', [slot, intent.id]) === undefined, 'directed operation ID was already used');
  const { state } = await startDirectedStreamTravel({ checkpoint, control: token }, { ...intent, limits: policy ?? configuredDestinationLimits() },
    id => savedStreamKnowledge(tx, slot, id, checkpoint.revision), now);
  if (admissionOnly && state.operation.status === 'interrupted') throw new DirectedAdmissionRefused(state.operation.reason);
  const record: StoredDirectedStreamOperation = { version: 1, revision: 0, state };
  await tx.put('directedStreamHeads', [slot], { version: 1, operationId: intent.id });
  await tx.stageRoot(slot, root);
  return writeDirectedRecord(tx, slot, record);
}

export class DirectedAdmissionRefused extends Error {}

/** Commit the exact original request before dispatch. Every await remains within the topology transaction. */
export async function prepareDurableDirectedStreamMove(slot: string, owner: StreamControl,
  input: { operationId: string; revision: number; actionId: string }, now: () => number = Date.now) {
  validId(slot); validId(input.operationId); validId(input.actionId); validateStreamControl(owner);
  const step = structuredClone(input), token = structuredClone(owner);
  return topologyTransaction(async tx => {
    const { checkpoint } = await streamRecord(tx, slot);
    const control = await streamControl(tx, slot);
    const { record, active } = await directedRecordAt(tx, slot, checkpoint, step.operationId);
    streamCheck(record && active, 'directed operation is not active');
    if (record.lastAttempt?.request.actionId === step.actionId || record.state.pending?.request.actionId === step.actionId) return record;
    streamCheck(sameStreamControl(control, token) && record.revision === step.revision, 'directed preparation custody changed');
    streamCheck(await tx.get('streamActions', [slot, step.actionId]) === undefined, 'directed action ID was already used');
    const prepared = await prepareDirectedStreamStep(record.state, { checkpoint, control: token },
      { operationId: step.operationId, sequence: record.state.operation.nextStep, actionId: step.actionId },
      id => savedStreamKnowledge(tx, slot, id, checkpoint.revision), now);
    if (prepared.kind === 'refused') {
      streamCheck(!record.state.pending, 'another directed attempt is pending');
      retireDirectedPending(record, prepared.reason);
    } else record.state = prepared.state;
    return writeDirectedRecord(tx, slot, record);
  });
}

/** Immediate move, stream receipt and operation settlement commit or roll back together. */
export async function executeDurableDirectedStreamMove(slot: string, owner: StreamControl,
  input: { operationId: string; actionId: string }, geometry?: StreamGeometryReader, now: () => number = Date.now) {
  validId(slot); validId(input.operationId); validId(input.actionId); validateStreamControl(owner);
  const attempt = structuredClone(input), token = structuredClone(owner);
  return topologyTransaction(async tx => {
    const { checkpoint } = await streamRecord(tx, slot);
    const { record, active } = await directedRecordAt(tx, slot, checkpoint, attempt.operationId);
    streamCheck(record, 'directed operation is missing');
    // Read-only reconciliation remains valid after cancellation or takeover.
    if (record.lastAttempt?.request.actionId === attempt.actionId) return record;
    streamCheck(active && record.state.pending?.request.actionId === attempt.actionId, 'no matching directed pending attempt');
    const control = await streamControl(tx, slot);
    streamCheck(control, 'stream control is missing');
    const state = record.state;
    streamCheck(sameStreamControl(state.frame.control, token), 'directed attempt owner mismatch');
    const fenced = sameStreamControl(control, token) && sameDirectedFrame(state.frame, { checkpoint, control })
      && state.operation.status === 'running' && !state.paused && !destinationExpired(state.operation, now());
    if (!fenced) {
      await reconcileDirectedAt(tx, slot, record, checkpoint);
      if (sameStreamControl(control, token)) await revokeDirectedAt(tx, slot, token.sessionId);
      retireDirectedPending(record, 'Travel expired, was paused, or lost custody before execution.');
      return writeDirectedRecord(tx, slot, record);
    }
    const request = structuredClone(state.pending!.request);
    streamCheck(request.command.type === 'move', 'directed executor only admits movement');
    const result = await executeStreamActionInTransaction(tx, slot, request, geometry);
    const after = (await streamRecord(tx, slot)).checkpoint;
    streamCheck(!destinationExpired(state.operation, now()), 'directed deadline expired before commit');
    // With a fenced exploring checkpoint, the existing move host can only
    // refuse an immediate wall/unprepared doorway. No refusal text is parsed.
    record.state = settleDirectedStreamMove(state, result, result.disposition === 'refused' && checkpoint.phase === 'exploring', after);
    streamCheck(!record.state.pending, 'directed effect did not match the prepared endpoint');
    record.state.frame.checkpoint = after;
    record.lastAttempt = { request, result, outcome: 'settled' };
    return writeDirectedRecord(tx, slot, record);
  });
}

/** Serialize with all effects, reconcile first, revoke the epoch, then acknowledge. */
export async function stopDurableDirectedStreamTravel(slot: string, owner: StreamControl,
  operationId: string, kind: 'cancel' | 'pause' = 'cancel'): Promise<DirectedStreamSession> {
  const token = structuredClone(owner);
  return topologyTransaction(tx => stopDurableDirectedStreamTravelInTransaction(tx, slot, token, operationId, kind));
}

export async function stopDurableDirectedStreamTravelInTransaction(tx: TopologyTransaction, slot: string, owner: StreamControl,
  operationId: string, kind: 'cancel' | 'pause' = 'cancel'): Promise<DirectedStreamSession> {
  validId(slot); validId(operationId); validateStreamControl(owner);
  const token = structuredClone(owner);
    const { checkpoint } = await streamRecord(tx, slot);
    const current = await streamControl(tx, slot);
    const { record, active } = await directedRecordAt(tx, slot, checkpoint, operationId);
    streamCheck(record && active && sameStreamControl(current, token), 'directed stop custody changed');
    await reconcileDirectedAt(tx, slot, record, checkpoint);
    const control = await revokeDirectedAt(tx, slot, token.sessionId);
    retireDirectedPending(record, kind === 'cancel' ? 'Travel cancelled.' : 'Travel paused after an uncertain acknowledgement.');
    if (kind === 'cancel') {
      record.state = cancelDirectedStreamTravel(record.state);
      if (record.state.operation.status === 'interrupted') record.state.operation = stopDestinationOperation(record.state.operation, 'cancelled', 'Travel cancelled.');
    }
    else if (record.state.operation.status === 'running') {
      record.state.operation = stopDestinationOperation(record.state.operation, 'interrupted', record.state.operation.reason);
    }
    await writeDirectedRecord(tx, slot, record);
    return { checkpoint, control, record };
}

export function adoptDurableDirectedStreamTravel(slot: string, owner: StreamControl,
  input: { operationId: string; revision: number }, now: () => number = Date.now) {
  const token = structuredClone(owner), intent = structuredClone(input);
  return topologyTransaction(tx => adoptDurableDirectedStreamTravelInTransaction(tx, slot, token, intent, now));
}

/** Explicit new custody, same semantic intention. Budgets and original receipts never reset. */
export async function adoptDurableDirectedStreamTravelInTransaction(tx: TopologyTransaction, slot: string, owner: StreamControl,
  input: { operationId: string; revision: number }, now: () => number = Date.now) {
  validId(slot); validId(input.operationId); validateStreamControl(owner);
  const token = structuredClone(owner), intent = structuredClone(input);
  const { checkpoint } = await streamRecord(tx, slot);
  streamCheck(sameStreamControl(await streamControl(tx, slot), token), 'adoption owner changed');
  const { record, active } = await directedRecordAt(tx, slot, checkpoint, intent.operationId);
  streamCheck(record && active && record.revision === intent.revision && record.state.paused, 'adoption requires the current paused intention');
  await reconcileDirectedAt(tx, slot, record, checkpoint);
  const state = record.state, operation = state.operation;
  streamCheck(['running', 'interrupted'].includes(operation.status), 'terminal intention cannot be adopted');
  streamCheck(operation.epoch !== token.epoch, 'adoption requires new ownership');
  streamCheck(checkpoint.phase === 'exploring' && !destinationExpired(operation, now()), 'intention hard deadline exhausted');
  const limits = snapshotDestinationLimits(operation.limits);
  const loaded = await loadDirectedStreamKnowledge({ checkpoint, control: token }, operation.target,
    id => savedStreamKnowledge(tx, slot, id, checkpoint.revision), state.blocked);
  streamCheck(loaded.plan.status === 'ready', 'destination lacks an actor-known route');
  streamCheck(!exceedsLimit(operation.steps + loaded.plan.route.length, limits.steps), 'intention step budget exhausted');
  streamCheck(!limitReached(operation.replans, limits.replans), 'intention replan budget exhausted');
  retireDirectedPending(record, 'Original attempt reconciled before explicit adoption.');
  record.state.frame = { checkpoint: structuredClone(checkpoint), control: token };
  record.state.paused = false;
  record.state.operation = { ...operation, epoch: token.epoch, status: loaded.plan.route.length ? 'running' : 'arrived',
    replans: operation.replans + 1, route: loaded.plan.route, reason: loaded.plan.route.length ? 'Explicitly adopted under new ownership.' : 'Arrived. No interaction performed.' };
  streamCheck(!destinationExpired(operation, now()), 'intention deadline expired before adoption commit');
  return writeDirectedRecord(tx, slot, record);
}
