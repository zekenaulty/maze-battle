import { check, integer, isObject, validId } from './validation';

export interface PrivateCapacity {
  version: 'private-world-v1';
  allocatedBytes: number;
  consumedBytes: number;
  active: { id: string; budgetBytes: number; consumedBytes: number } | null;
}

// Covers the bounded checkpoint, sixteen custody anchors, IDs and accounting fields.
// This is admission capacity, never a claim about actual serialized or disk bytes.
export const HEAD_CAPACITY_BYTES = 12 * 1024;
export const emptyPrivateCapacity = (): PrivateCapacity => ({
  version: 'private-world-v1', allocatedBytes: 0, consumedBytes: 0, active: null,
});

export function validatePrivateCapacity(value: unknown): asserts value is PrivateCapacity {
  check(isObject(value) && Object.keys(value).sort().join(',') === 'active,allocatedBytes,consumedBytes,version'
    && value.version === 'private-world-v1' && integer(value.allocatedBytes) && integer(value.consumedBytes)
    && value.consumedBytes <= value.allocatedBytes, 'invalid private capacity');
  const active = value.active;
  if (active === null) return;
  check(isObject(active) && Object.keys(active).sort().join(',') === 'budgetBytes,consumedBytes,id'
    && validId(active.id) && integer(active.budgetBytes, 1) && integer(active.consumedBytes)
    && active.consumedBytes <= active.budgetBytes && active.budgetBytes <= value.allocatedBytes
    && active.consumedBytes <= value.consumedBytes
    && active.budgetBytes - active.consumedBytes <= value.allocatedBytes - value.consumedBytes,
  'invalid active private capacity');
}

export function reservePrivateCapacity(value: PrivateCapacity, id: string, bytes: number): PrivateCapacity {
  validatePrivateCapacity(value);
  check(value.active === null && validId(id) && integer(bytes, 1), 'invalid private capacity reservation');
  const next: PrivateCapacity = { ...value, allocatedBytes: value.allocatedBytes + bytes,
    active: { id, budgetBytes: bytes, consumedBytes: 0 } };
  validatePrivateCapacity(next); return next;
}

/** Only genuine committed preparation bytes consume a reservation; the current head is separately covered. */
export function consumePrivateCapacity(value: PrivateCapacity, id: string, bytes: number): PrivateCapacity {
  validatePrivateCapacity(value);
  check(value.active?.id === id && integer(bytes), 'private capacity ownership changed');
  const next: PrivateCapacity = { ...value, consumedBytes: value.consumedBytes + bytes,
    active: { ...value.active, consumedBytes: value.active.consumedBytes + bytes } };
  validatePrivateCapacity(next); return next;
}

/** Closing or abandoning preparation never returns unused private allowance to ordinary actions. */
export function closePrivateCapacity(value: PrivateCapacity, id: string): PrivateCapacity {
  validatePrivateCapacity(value);
  check(value.active?.id === id, 'private capacity ownership changed');
  return { ...value, active: null };
}

/** Actual occupancy plus retained private slack and a fixed head envelope. Not a raw-byte metric. */
export function privateAdmissionBytes(value: PrivateCapacity, actualUsedBytes: number, actualHeadBytes: number): number {
  validatePrivateCapacity(value);
  check(integer(actualUsedBytes) && integer(actualHeadBytes, 1) && actualHeadBytes <= HEAD_CAPACITY_BYTES
    && actualUsedBytes >= actualHeadBytes && actualUsedBytes - actualHeadBytes >= value.consumedBytes,
  'invalid private capacity occupancy');
  const slack = value.allocatedBytes - value.consumedBytes;
  const charge = actualUsedBytes - actualHeadBytes + slack + HEAD_CAPACITY_BYTES;
  check(integer(charge), 'private capacity charge overflow'); return charge;
}
