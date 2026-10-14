import { canonicalJson } from '../../services/agentica/sdk/agentica-host.mjs';
import { ACKNOWLEDGEMENT_BYTES, MAX_TERMINAL_BYTES, MIN_TERMINAL_BYTES,
  type CanonicalHead, type CanonicalOperation, type CanonicalRequest, type OperationDisposition } from './types';
import { check, identity, integer, isObject, jsonBytes, validId } from './validation';

export type OperationAction = 'admit' | 'settle' | 'cancel' | 'acknowledge' | 'adopt';
const dispositions: OperationDisposition[] = ['completed', 'decision', 'blocked', 'cancelled'];
export const terminalAllowance = (bytes: unknown): bytes is number => integer(bytes, MIN_TERMINAL_BYTES) && bytes <= MAX_TERMINAL_BYTES;
export const MAX_ACK_PROOF_BYTES = 6 * 1024;
export const sealOperation = (body: Omit<CanonicalOperation, 'witness'>): CanonicalOperation => ({ ...body, witness: canonicalJson(body) });
export function reservedFor(row: CanonicalOperation) {
  return row.state === 'admitted' ? row.terminalBytes + ACKNOWLEDGEMENT_BYTES : row.state === 'settled' ? ACKNOWLEDGEMENT_BYTES : 0;
}

export function operationInput(request: CanonicalRequest, action: OperationAction) {
  check(['admit', 'settle', 'cancel', 'acknowledge', 'adopt'].includes(action) && request.operation === `operation.${action}`, 'invalid operation action');
  const value = request.input;
  check(isObject(value) && validId(value.operationId), 'invalid operation input');
  const keys = Object.keys(value).sort().join(',');
  const expected = action === 'admit' ? `${Object.hasOwn(value, 'ackPolicy') ? 'ackPolicy,' : ''}binding,operationId,terminalBytes` : action === 'settle' ? 'disposition,operationId'
    : action === 'acknowledge' ? `operationId,${Object.hasOwn(value, 'proof') ? 'proof,' : ''}terminalAttemptId` : 'operationId';
  check(keys === expected, 'invalid operation fields');
  if (action === 'admit') {
    check(isObject(value.binding), 'invalid operation binding'); jsonBytes(value.binding, 4096);
    check(terminalAllowance(value.terminalBytes), 'invalid terminal allowance');
    check(!Object.hasOwn(value, 'ackPolicy') || value.ackPolicy === 'verified-host', 'invalid acknowledgement policy');
  }
  if (action === 'settle') check(dispositions.includes(value.disposition as OperationDisposition) && value.disposition !== 'cancelled', 'invalid settlement disposition');
  if (action === 'acknowledge') check(validId(value.terminalAttemptId), 'invalid terminal attempt');
  if (action === 'acknowledge' && Object.hasOwn(value, 'proof')) { check(isObject(value.proof), 'invalid acknowledgement proof'); jsonBytes(value.proof, MAX_ACK_PROOF_BYTES); }
  return value;
}

export function validateOperation(value: CanonicalOperation | undefined, id: string, scope: CanonicalHead): asserts value is CanonicalOperation {
  check(value && value.schema === 1 && value.id === id && validId(id), 'missing operation');
  identity(value, scope); jsonBytes(value);
  check(isObject(value.binding), 'invalid operation binding'); jsonBytes(value.binding, 4096);
  check(validId(value.admissionAttemptId) && validId(value.owner) && integer(value.epoch, 1) && value.epoch <= scope.epoch
    && integer(value.revision, 1) && value.revision <= scope.revision && terminalAllowance(value.terminalBytes), 'invalid operation authority');
  const { witness, ...body } = value;
  check(witness === canonicalJson(body), 'operation witness mismatch');
  const baseKeys = 'admissionAttemptId,binding,epoch,gameId,generation,id,owner,revision,schema,state,terminalBytes,witness';
  const actualKeys = Object.keys(value).filter(k => k !== 'terminal' && k !== 'acknowledgementAttemptId' && k !== 'ackPolicy').sort().join(',');
  check(!Object.hasOwn(value, 'ackPolicy') || value.ackPolicy === 'verified-host', 'invalid acknowledgement policy');
  check(actualKeys === baseKeys && ['admitted', 'settled', 'acknowledged'].includes(value.state), 'invalid operation state');
  check(value.state === 'admitted' ? value.terminal === undefined : value.terminal && validId(value.terminal.attemptId)
    && dispositions.includes(value.terminal.disposition) && Object.keys(value.terminal).sort().join(',') === 'attemptId,disposition', 'invalid operation terminal');
  check(value.state === 'acknowledged' ? validId(value.acknowledgementAttemptId) : value.acknowledgementAttemptId === undefined, 'invalid operation acknowledgement');
}
