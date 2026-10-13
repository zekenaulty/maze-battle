import { storedBytes } from './accounting';
import { canonicalJson } from '../../services/agentica/sdk/agentica-host.mjs';
import type { WorkBudget } from './budget';
import { operationInput, reservedFor, sealOperation, validateOperation, type OperationAction } from './operationValidation';
import { validateReceipt } from './receipts';
import { MAX_RESERVATIONS, type CanonicalHead, type CanonicalOperation, type CanonicalRead, type CanonicalRequest,
  type CanonicalWrite, type JsonObject, type OperationDisposition } from './types';
import { check, isObject, jsonBytes, validId } from './validation';

export async function operationAt(tx: CanonicalRead | CanonicalWrite, current: CanonicalHead, id: string, budget: WorkBudget) {
  check(validId(id), 'invalid operation ID'); budget.read();
  const row = await tx.objectStore('operations').get([current.gameId, id]);
  budget.received(row ? jsonBytes(row) : 0);
  const anchor = Object.hasOwn(current.allocations, id) ? current.allocations[id] : undefined;
  if (row) {
    validateOperation(row, id, current);
    check(row.state === 'acknowledged' ? !anchor : anchor && anchor.revision === row.revision && anchor.bytes === reservedFor(row), 'operation allocation anchor changed');
    await requireOriginal(tx, current, row, budget);
  } else check(!anchor, 'missing funded operation');
  return row;
}

export interface OperationChange {
  before?: CanonicalOperation;
  after: CanonicalOperation;
  released: number;
  quota: CanonicalHead['quota'];
  allocations: CanonicalHead['allocations'];
  chargedBytes: number;
}

/** Host ledger, not a provider grant surface. World/evidence effects still use the same transaction. */
export async function prepareOperation(tx: CanonicalWrite, current: CanonicalHead, request: CanonicalRequest, action: OperationAction, budget: WorkBudget): Promise<OperationChange> {
  const input = operationInput(request, action), id = input.operationId as string;
  const before = await operationAt(tx, current, id, budget);
  let after: CanonicalOperation;
  if (action === 'admit') {
    check(!before, 'operation already exists');
    check(current.quota.reservations < MAX_RESERVATIONS, 'pending operation limit');
    after = sealOperation({ schema: 1, generation: current.generation, gameId: current.gameId, id,
      binding: input.binding as JsonObject, admissionAttemptId: request.attemptId,
      owner: current.owner, epoch: current.epoch, revision: current.revision + 1, state: 'admitted', terminalBytes: input.terminalBytes as number });
  } else {
    check(before, 'operation was not admitted');
    const { witness: _witness, ...body } = before;
    check(action === 'acknowledge' ? before.state === 'settled' : before.state === 'admitted', 'operation phase changed');
    if (action === 'settle') check(before.owner === current.owner && before.epoch === current.epoch, 'operation needs explicit adoption');
    if (action === 'adopt') check(before.owner !== current.owner || before.epoch !== current.epoch, 'operation already owned');
    if (action === 'acknowledge') check(input.terminalAttemptId === before.terminal!.attemptId, 'terminal acknowledgement changed');
    after = sealOperation({ ...body, owner: current.owner, epoch: current.epoch, revision: current.revision + 1,
      ...(action === 'adopt' ? {} : action === 'acknowledge' ? { state: 'acknowledged', acknowledgementAttemptId: request.attemptId }
        : { state: 'settled', terminal: { attemptId: request.attemptId, disposition: action === 'cancel' ? 'cancelled' : input.disposition as OperationDisposition } }) });
  }
  const reservedBefore = before ? reservedFor(before) : 0, reservedAfter = reservedFor(after);
  const released = Math.max(0, reservedBefore - reservedAfter);
  const quota = { ...current.quota, reservedBytes: current.quota.reservedBytes + reservedAfter - reservedBefore,
    reservations: current.quota.reservations + (action === 'admit' ? 1 : action === 'acknowledge' ? -1 : 0) };
  check(quota.reservedBytes >= 0 && quota.reservations >= 0, 'reservation accounting mismatch');
  const allocations = { ...current.allocations };
  if (reservedAfter) Object.defineProperty(allocations, id, { value: { revision: after.revision, bytes: reservedAfter }, enumerable: true, writable: true, configurable: true });
  else delete allocations[id];
  const charge = (row: CanonicalOperation) => storedBytes('operations', [row.gameId, row.id], row);
  budget.write(jsonBytes(after));
  return { before, after, released, quota, allocations, chargedBytes: charge(after) - (before ? charge(before) : 0) };
}

async function requireOriginal(tx: CanonicalRead | CanonicalWrite, current: CanonicalHead, row: CanonicalOperation, budget: WorkBudget) {
  for (const [id, operation] of [[row.admissionAttemptId, 'operation.admit'], ...(row.terminal ? [[row.terminal.attemptId,
    row.terminal.disposition === 'cancelled' ? 'operation.cancel' : 'operation.settle']] : []),
    ...(row.acknowledgementAttemptId ? [[row.acknowledgementAttemptId, 'operation.acknowledge']] : [])]) {
    budget.read(); const receipt = await tx.objectStore('receipts').get([current.gameId, id]);
    check(receipt, 'missing operation source receipt'); budget.received(jsonBytes(receipt));
    check(receipt.attemptId === id, 'operation source receipt changed');
    const original = validateReceipt(receipt, current);
    operationInput(original, operation.slice('operation.'.length) as OperationAction);
    check(receipt.afterRevision <= current.revision, 'operation source revision changed');
    check(original.operation === operation && isObject(original.input) && original.input.operationId === row.id, 'operation source binding changed');
    if (operation === 'operation.admit') check(canonicalJson(original.input.binding) === canonicalJson(row.binding)
      && original.input.terminalBytes === row.terminalBytes, 'original reservation changed');
    if (operation === 'operation.settle') check(original.input.disposition === row.terminal!.disposition, 'terminal disposition changed');
    if (operation === 'operation.acknowledge') check(original.input.terminalAttemptId === row.terminal!.attemptId, 'terminal acknowledgement changed');
  }
}
