import { pauseDirectedStreamTravel, settleDirectedStreamMove } from '../domain/expedition/streaming/directed/execution';
import { stopDestinationOperation } from '../domain/directed/destinationExecution';
import type { StreamCheckpoint, StreamControl } from '../domain/expedition/streaming/types';
import type { StoredDirectedStreamOperation } from './directedStreamTypes';
import { validateDirectedStreamRecord } from './directedStreamValidation';
import { streamControl, streamRecord } from './streamRecords';
import { natural, object, only, streamActionSignature, streamCheck, validateStreamControl, validateStreamReceipt } from './streamValidation';
import type { TopologyTransaction } from './topology/database';
import { validId } from './topology/validation';

export const sameStreamControl = (a: StreamControl | undefined, b: StreamControl) => a?.sessionId === b.sessionId && a.epoch === b.epoch;

export async function directedRecordAt(tx: TopologyTransaction, slot: string, checkpoint: StreamCheckpoint, id?: string) {
  const head = await tx.get('directedStreamHeads', [slot]);
  if (head !== undefined) {
    streamCheck(object(head) && only(head, 'version,operationId') && head.version === 1, 'invalid directed head');
    validId(head.operationId);
  }
  const operationId = id ?? head?.operationId;
  if (!operationId) return {};
  validId(operationId);
  const record = await tx.get('directedStreamOperations', [slot, operationId]);
  streamCheck(record !== undefined, 'directed head or operation is missing');
  validateDirectedStreamRecord(record, operationId, checkpoint);
  return { record, active: head?.operationId === operationId };
}

export async function writeDirectedRecord(tx: TopologyTransaction, slot: string, record: StoredDirectedStreamOperation) {
  const { root, checkpoint } = await streamRecord(tx, slot);
  streamCheck(natural(record.revision + 1), 'directed record revision exhausted');
  record.revision++;
  validateDirectedStreamRecord(record, record.state.operation.id, checkpoint);
  await tx.put('directedStreamOperations', [slot, record.state.operation.id], record);
  await tx.stageRoot(slot, root);
  return record;
}

/** Must share the slot lock with cancellation/reload, so no request can enter between lookup and revocation. */
export async function reconcileDirectedAt(tx: TopologyTransaction, slot: string, record: StoredDirectedStreamOperation, checkpoint: StreamCheckpoint) {
  const pending = record.state.pending;
  if (!pending) return;
  const receipt = await tx.get('streamActions', [slot, pending.request.actionId]);
  if (!receipt) return;
  validateStreamReceipt(receipt, pending.request.actionId, checkpoint);
  streamCheck(receipt.signature === streamActionSignature(pending.request), 'directed action identity was reused');
  record.lastAttempt = { request: structuredClone(pending.request), result: receipt.result, outcome: 'settled' };
  if (checkpoint.revision === receipt.result.afterRevision && checkpoint.topologyRevision === receipt.result.topologyRevision) {
    record.state = settleDirectedStreamMove(record.state, receipt.result, receipt.result.disposition === 'refused' && checkpoint.phase === 'exploring', checkpoint);
    streamCheck(!record.state.pending, 'original action result disagrees with its directed endpoint');
  } else {
    record.state.operation.steps += Number(receipt.result.disposition === 'applied');
    record.state.operation = stopDestinationOperation(record.state.operation, 'interrupted', 'Original move settled; the checkpoint has since advanced.');
    delete record.state.pending;
  }
  record.state.frame.checkpoint = structuredClone(checkpoint);
}

/** Revoking the epoch and retiring an uncommitted attempt happen under the same IDB lock. */
export async function revokeDirectedAt(tx: TopologyTransaction, slot: string, sessionId: string) {
  const previous = await streamControl(tx, slot);
  const control = { sessionId, epoch: previous ? previous.epoch + 1 : 0 };
  validateStreamControl(control);
  await tx.put('streamControls', [slot], control);
  return control;
}

export function retireDirectedPending(record: StoredDirectedStreamOperation, reason: string) {
  if (record.state.pending) record.lastAttempt = { request: structuredClone(record.state.pending.request), outcome: 'revoked' };
  record.state = pauseDirectedStreamTravel(record.state, reason);
  delete record.state.pending;
}
