import { describe, expect, it } from 'vitest';
import { accountHead } from './accounting';
import { emptyPrivateCapacity } from './privateCapacity';
import { operationInput, reservedFor, sealOperation, validateOperation } from './operationValidation';
import { validateReceipt } from './receipts';
import { fingerprint, head, request } from './validation';
import { DEFAULT_QUOTA, MIN_TERMINAL_BYTES, type CanonicalHead, type CanonicalOperation, type CanonicalReceipt, type CanonicalRequest } from './types';

const initial = (): CanonicalHead => ({ schema: 1, generation: 'g', gameId: 'game', owner: 'owner', epoch: 1, revision: 1, status: 'ready',
  roots: { world: null, knowledge: null, execution: null }, checkpoint: {}, allocations: {},
  quota: { ...DEFAULT_QUOTA, usedBytes: 0, reservedBytes: 0, reservations: 0, privateCapacity: emptyPrivateCapacity() } });
const command = (): CanonicalRequest => ({ attemptId: 'attempt', expected: { generation: 'g', gameId: 'game', owner: 'owner', epoch: 1, revision: 1 },
  operation: 'operation.admit', input: { operationId: 'op', binding: { target: 'room' }, terminalBytes: MIN_TERMINAL_BYTES }, deadlineAt: null });
const operation = (): CanonicalOperation => sealOperation({ schema: 1, generation: 'g', gameId: 'game', id: 'op', binding: { target: 'room' },
  admissionAttemptId: 'attempt', owner: 'owner', epoch: 1, revision: 1, state: 'admitted', terminalBytes: MIN_TERMINAL_BYTES });
const receipt = (): CanonicalReceipt => ({ generation: 'g', gameId: 'game', attemptId: 'attempt', fingerprint: fingerprint(command()),
  beforeRevision: 1, afterRevision: 2, committedAt: '2026-10-13T00:00:00.000Z', result: { admitted: true } });

describe('admitted operation storage contract', () => {
  it.each([0, 1, MIN_TERMINAL_BYTES - 1, Infinity, 4 * 1024 * 1024 + 1])('rejects unsafe terminal allowance %s', bytes => {
    const input = command(); input.input = { operationId: 'op', binding: {}, terminalBytes: bytes };
    expect(() => operationInput(input, 'admit')).toThrow();
  });
  it('keeps terminal and acknowledgement allowance distinct', () => {
    const row = operation(); expect(reservedFor(row)).toBe(147456);
    expect(reservedFor({ ...row, state: 'settled' })).toBe(16384);
    expect(reservedFor({ ...row, state: 'acknowledged' })).toBe(0);
  });
  it.each(['completed', 'decision', 'blocked'])('accepts a host terminal disposition %s', disposition => {
    const input = { ...command(), operation: 'operation.settle', input: { operationId: 'op', disposition } };
    expect(operationInput(input, 'settle').disposition).toBe(disposition);
  });
  it('reserves cancellation for its effect-free path', () => {
    expect(() => operationInput({ ...command(), operation: 'operation.settle', input: { operationId: 'op', disposition: 'cancelled' } }, 'settle')).toThrow();
  });
  it('validates control record witnesses and lifecycle fields', () => {
    const row = operation(); expect(() => validateOperation(row, row.id, initial())).not.toThrow();
    const { witness: _witness, ...body } = row;
    expect(() => validateOperation({ ...row, terminalBytes: row.terminalBytes * 2 }, row.id, initial())).toThrow('witness');
    expect(() => validateOperation(sealOperation({ ...body, state: 'settled' }), row.id, initial())).toThrow('invalid operation terminal');
  });
  it('rejects aggregate quota counters that disagree with bounded allocation anchors', () => {
    const current = initial(); current.quota.reservedBytes = 147456; current.quota.reservations = 1;
    expect(() => head(current)).toThrow('anchors');
    current.allocations.op = { revision: 1, bytes: 147456 }; expect(() => head(current)).not.toThrow();
    current.allocations.op.bytes--; expect(() => head(current)).toThrow('anchors');
  });
  it('normal admission subtracts both recovery and operation commitments', () => {
    const current = initial(); current.quota = { ...current.quota, limitBytes: 300_000, reserveBytes: 65_536, reservedBytes: 147456, reservations: 1 };
    current.allocations.op = { revision: 1, bytes: 147456 };
    expect(() => accountHead(undefined, current, 90_000)).toThrow('storage quota');
    expect(accountHead(undefined, current, 70_000).quota.reservedBytes).toBe(147456);
  });
});

describe('complete receipt and envelope validation', () => {
  it('shares exact receipt validation between replay and source references', () => {
    expect(validateReceipt(receipt(), initial(), command())).toEqual(command());
  });
  it.each(['result', 'committedAt', 'fingerprint', 'afterRevision', 'generation'])('rejects missing receipt field %s', key => {
    const value = receipt(); Reflect.deleteProperty(value, key);
    expect(() => validateReceipt(value, initial())).toThrow();
  });
  it.each(['not-a-time', '2026-10-13', '2026-10-13T00:00:00Z'])('requires retained canonical commit time %s', committedAt => {
    expect(() => validateReceipt({ ...receipt(), committedAt }, initial())).toThrow();
  });
  it('rejects unsupported envelope/fence fields before fingerprint growth', () => {
    expect(() => request({ ...command(), extra: 'x' } as CanonicalRequest)).toThrow('unsupported');
    const value = command(); Object.assign(value.expected, { extra: 'x' });
    expect(() => request(value)).toThrow('unsupported');
  });
});
