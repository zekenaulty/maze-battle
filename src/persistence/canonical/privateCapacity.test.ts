// @vitest-environment node
import { expect, it } from 'vitest';
import { closePrivateCapacity, consumePrivateCapacity, emptyPrivateCapacity, HEAD_CAPACITY_BYTES,
  privateAdmissionBytes, reservePrivateCapacity, validatePrivateCapacity } from './privateCapacity';
import { storedBytes } from './accounting';
import { head } from './validation';
import type { CanonicalHead } from './types';

it('retains private slack through preparation, completion and another floor without mutating inputs', () => {
  const empty = emptyPrivateCapacity(), reserved = reservePrivateCapacity(empty, 'floor-one', 1000);
  const consumed = consumePrivateCapacity(reserved, 'floor-one', 900);
  const closed = closePrivateCapacity(consumed, 'floor-one');
  const next = reservePrivateCapacity(closed, 'floor-two', 2000);
  expect(empty).toEqual(emptyPrivateCapacity()); expect(reserved.consumedBytes).toBe(0);
  expect(closed).toMatchObject({ allocatedBytes: 1000, consumedBytes: 900, active: null });
  expect(next).toMatchObject({ allocatedBytes: 3000, consumedBytes: 900,
    active: { id: 'floor-two', budgetBytes: 2000, consumedBytes: 0 } });
  expect(privateAdmissionBytes(closed, 1500, 500)).toBe(1100 + HEAD_CAPACITY_BYTES);
  expect(privateAdmissionBytes(next, 1600, 600)).toBe(3100 + HEAD_CAPACITY_BYTES);
});

it.each([9, 99, 999, 9999, 99999])('ordinary admission ignores private size and counter widths around %i', boundary => {
  const envelope = boundary * 3, publicBytes = 1200;
  const outcomes = [-1, 0, 1].map(offset => {
    const spent = boundary + offset;
    const cap = consumePrivateCapacity(reservePrivateCapacity(emptyPrivateCapacity(), 'floor', envelope), 'floor', spent);
    const headBytes = Buffer.byteLength(JSON.stringify(cap)) + 500;
    const charged = privateAdmissionBytes(cap, publicBytes + spent + headBytes, headBytes);
    return { spent, charged, allowed: [-1, 0, 1].map(delta => charged <= publicBytes + envelope + HEAD_CAPACITY_BYTES + delta) };
  });
  expect(new Set(outcomes.map(row => row.spent)).size).toBe(3);
  expect(outcomes.map(row => row.charged)).toEqual(Array(3).fill(publicBytes + envelope + HEAD_CAPACITY_BYTES));
  expect(outcomes.map(row => row.allowed)).toEqual(Array(3).fill([false, true, true]));
});

it('public writes still consume capacity, independently of unused private allocation', () => {
  const cap = consumePrivateCapacity(reservePrivateCapacity(emptyPrivateCapacity(), 'floor', 10000), 'floor', 9999);
  const first = privateAdmissionBytes(cap, 11000, 500), second = privateAdmissionBytes(cap, 11540, 540);
  expect(second - first).toBe(500);
  const closed = closePrivateCapacity(cap, 'floor');
  expect(privateAdmissionBytes(closed, 10800, 300)).toBe(first);
});

it('keeps equal admission near the safe-integer boundary without intermediate rounding', () => {
  const allocatedBytes = 2 ** 52 + 1000, publicBytes = 1000, headBytes = 500;
  const charges = [2 ** 52, 2 ** 52 + 1].map(consumedBytes => {
    const capacity = { ...emptyPrivateCapacity(), allocatedBytes, consumedBytes };
    return privateAdmissionBytes(capacity, consumedBytes + publicBytes + headBytes, headBytes);
  });
  expect(charges).toEqual(Array(2).fill(allocatedBytes + publicBytes + HEAD_CAPACITY_BYTES));
});

it('cannot spend inactive, foreign, exhausted or closed capacity, or overlap reservations', () => {
  const reserved = reservePrivateCapacity(emptyPrivateCapacity(), 'floor', 1000);
  expect(() => reservePrivateCapacity(reserved, 'other', 1000)).toThrow('reservation');
  expect(() => consumePrivateCapacity(emptyPrivateCapacity(), 'floor', 1)).toThrow('ownership');
  expect(() => consumePrivateCapacity(reserved, 'other', 1)).toThrow('ownership');
  expect(() => closePrivateCapacity(reserved, 'other')).toThrow('ownership');
  expect(() => consumePrivateCapacity(reserved, 'floor', 1001)).toThrow('private capacity');
  expect(() => consumePrivateCapacity(closePrivateCapacity(reserved, 'floor'), 'floor', 1)).toThrow('ownership');
  expect(() => reservePrivateCapacity(emptyPrivateCapacity(), 'floor', 0)).toThrow();
  expect(() => reservePrivateCapacity(emptyPrivateCapacity(), 'floor', -1)).toThrow();
});

it.each([undefined, null, {}, { ...emptyPrivateCapacity(), version: 'unknown' },
  { ...emptyPrivateCapacity(), allocatedBytes: 1, consumedBytes: 2 },
  { ...emptyPrivateCapacity(), allocatedBytes: -1 }, { ...emptyPrivateCapacity(), consumedBytes: NaN },
  { ...emptyPrivateCapacity(), extra: 0 }, { ...emptyPrivateCapacity(), allocatedBytes: 0.5 },
  { ...emptyPrivateCapacity(), active: { id: 'x', budgetBytes: 1, consumedBytes: 0 } }])('refuses invalid capacity without defaults: %j', value => {
  expect(() => validatePrivateCapacity(value)).toThrow('private capacity');
});

it('rejects unsafe sums, impossible occupancy and heads exceeding their declared envelope', () => {
  const max = { ...emptyPrivateCapacity(), allocatedBytes: Number.MAX_SAFE_INTEGER };
  expect(() => reservePrivateCapacity(max, 'floor', 1)).toThrow();
  expect(() => privateAdmissionBytes(max, 500, 500)).toThrow('overflow');
  expect(() => privateAdmissionBytes(emptyPrivateCapacity(), 499, 500)).toThrow('occupancy');
  expect(() => privateAdmissionBytes(emptyPrivateCapacity(), 20000, HEAD_CAPACITY_BYTES + 1)).toThrow('occupancy');
  const consumed = consumePrivateCapacity(reservePrivateCapacity(emptyPrivateCapacity(), 'floor', 1000), 'floor', 900);
  expect(() => privateAdmissionBytes(consumed, 1000, 500)).toThrow('occupancy');
});

it('covers the maximal bounded head structure without treating its allowance as actual bytes', () => {
  const id = 'x'.repeat(128), integer = Number.MAX_SAFE_INTEGER;
  const capacity = { ...emptyPrivateCapacity(), allocatedBytes: 2e15, consumedBytes: 1e15,
    active: { id, budgetBytes: 1.5e15, consumedBytes: 1e15 } };
  validatePrivateCapacity(capacity);
  const value: CanonicalHead = { schema: 1, generation: id, gameId: id, owner: id, epoch: integer, revision: integer,
    status: 'stopped', roots: { world: id, knowledge: id, execution: id }, checkpoint: { padding: 'x'.repeat(4082) },
    allocations: Object.fromEntries(Array.from({ length: 16 }, (_, i) => [String(i).padStart(128, 'x'),
      { revision: integer, bytes: 1e14 }])),
    quota: { usedBytes: 2e15, limitBytes: 8e15, reserveBytes: 1e15, reservedBytes: 16e14, reservations: 16 } };
  const extended = { ...value, quota: { ...value.quota, privateCapacity: capacity } };
  head(extended);
  const bytes = storedBytes('heads', id, extended);
  expect(bytes).toBeGreaterThan(8192); expect(bytes).toBeLessThan(HEAD_CAPACITY_BYTES);
  expect(privateAdmissionBytes(capacity, value.quota.usedBytes, bytes)).toBeGreaterThan(value.quota.usedBytes);
});
