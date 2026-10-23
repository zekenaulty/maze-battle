// @vitest-environment node
import { expect, it } from 'vitest';
import { accountHead, assertPrivateAdmission, storedBytes } from './accounting';
import { protocolHead } from './agentica/types.test-support';
import { consumePrivateCapacity, emptyPrivateCapacity, HEAD_CAPACITY_BYTES, reservePrivateCapacity } from './privateCapacity';
import { head } from './validation';

function initial(spent = 0, allocated = 0, publicBytes = 1000) {
  const value = protocolHead();
  value.quota.privateCapacity = allocated ? consumePrivateCapacity(
    reservePrivateCapacity(emptyPrivateCapacity(), 'floor', allocated), 'floor', spent) : emptyPrivateCapacity();
  return accountHead(undefined, value, spent + publicBytes);
}

it.each([-1, 0, 1])('uses equal private admission at the public threshold %i and truthful unequal occupancy', delta => {
  const cap = 50000, publicBytes = 1000, reserve = 65536;
  const limit = cap + publicBytes + HEAD_CAPACITY_BYTES + reserve + delta;
  const outcomes = [99, 100, 999].map(spent => {
    const value = initial(spent, cap, publicBytes);
    const next = { ...value, quota: { ...value.quota, limitBytes: limit, reserveBytes: reserve } };
    if (delta < 0) {
      expect(() => accountHead(value, next, 0)).toThrow('storage quota exhausted');
      return value.quota.usedBytes;
    }
    const accounted = accountHead(value, next, 0);
    expect(accounted.quota.usedBytes).toBe(spent + publicBytes + storedBytes('heads', accounted.gameId, accounted));
    return accounted.quota.usedBytes;
  });
  expect(new Set(outcomes).size).toBe(3);
});

it('rejects overbooked fresh policy even when raw accounting is valid', () => {
  const first = initial(100, 1_000_000);
  const current = accountHead(first, { ...first, quota: { ...first.quota, limitBytes: 200_000, reserveBytes: 65536 } }, 0, true, 'cleanup');
  head(current);
  expect(() => assertPrivateAdmission(current, true)).toThrow('storage quota exhausted');
  const cleaned = accountHead(current, { ...current, status: 'stopped' }, 500, true, 'cleanup');
  expect(cleaned.quota.privateCapacity).toEqual(current.quota.privateCapacity);
  expect(cleaned.checkpoint).toEqual(current.checkpoint); expect(cleaned.roots).toEqual(current.roots);
  expect(cleaned.quota.usedBytes).toBe(1600 + storedBytes('heads', cleaned.gameId, cleaned));
});

it.each(['missing', 'null', 'malformed'] as const)('never fills in %s policy during raw cleanup', variant => {
  const current = initial();
  if (variant === 'missing') delete current.quota.privateCapacity;
  else current.quota.privateCapacity = (variant === 'null' ? null : { version: 'wrong' }) as never;
  // A policy mutation here is a fault fixture; base-head validation deliberately does not repair it.
  head(current);
  const encoded = JSON.stringify(current.quota.privateCapacity), own = Object.hasOwn(current.quota, 'privateCapacity');
  expect(() => accountHead(current, current, 100, true)).toThrow('private capacity');
  const cleaned = accountHead(current, current, 100, true, 'cleanup');
  expect(Object.hasOwn(cleaned.quota, 'privateCapacity')).toBe(own);
  expect(JSON.stringify(cleaned.quota.privateCapacity)).toBe(encoded);
});

it.each([-1, 0, 1])('raw cleanup still honors actual bytes plus remaining reserves at threshold %i', delta => {
  const current = initial(1000, 1_000_000, 80000);
  const candidate = { ...current, quota: { ...current.quota, limitBytes: 200_000,
    reserveBytes: 65536, reservedBytes: 20000, reservations: 1 }, allocations: { remaining: { revision: 1, bytes: 20000 } } };
  const probe = accountHead(current, candidate, 200, true, 'cleanup');
  candidate.quota.limitBytes = probe.quota.usedBytes + probe.quota.reservedBytes + delta;
  if (delta < 0) expect(() => accountHead(current, candidate, 200, true, 'cleanup')).toThrow('storage quota exhausted');
  else {
    const cleaned = accountHead(current, candidate, 200, true, 'cleanup');
    expect(cleaned.quota.usedBytes + cleaned.quota.reservedBytes).toBe(cleaned.quota.limitBytes - delta);
    expect(cleaned.quota.usedBytes).toBe(81200 + storedBytes('heads', cleaned.gameId, cleaned));
    expect(cleaned.quota.privateCapacity).toEqual(current.quota.privateCapacity);
    expect(cleaned.allocations).toEqual(candidate.allocations); head(cleaned);
  }
});

it('funded settlement remains policy-gated, and raw cleanup requires the separate recovery classification', () => {
  const current = initial(), candidate = { ...current, quota: { ...current.quota, limitBytes: 70000, reserveBytes: 65536 } };
  expect(() => accountHead(current, candidate, 1000)).toThrow('storage quota exhausted');
  expect(accountHead(current, candidate, 1000, true).quota.usedBytes).toBeGreaterThan(current.quota.usedBytes);
  delete candidate.quota.privateCapacity;
  expect(() => accountHead(current, candidate, 1000, true)).toThrow('private capacity');
  expect(() => accountHead(current, candidate, 1000, false, 'cleanup')).toThrow('invalid capacity admission');
});
