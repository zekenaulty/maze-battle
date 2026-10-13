import { describe, expect, it } from 'vitest';
import { accountHead, storedBytes } from './accounting';
import { workBudget } from './budget';
import { checkpoint, head, jsonBytes, request } from './validation';
import { DEFAULT_QUOTA, type CanonicalHead, type CanonicalRequest } from './types';

const fixture = (): CanonicalHead => ({ schema: 1, generation: 'generation', gameId: 'game', owner: 'owner', epoch: 1,
  revision: 0, status: 'ready', roots: { world: null, knowledge: null, execution: null }, checkpoint: { floorId: 'floor-1' },
  quota: { ...DEFAULT_QUOTA, usedBytes: 0 } });

describe('canonical JSON and fences', () => {
  it.each([null, true, false, 0, -0, 1.25, '', 'hello', '\u00e9', '\ud83d\udc80', [], [0], {}, { a: 0 }])('counts exact serialized bytes for %j', value => {
    const bytes = new TextEncoder().encode(JSON.stringify(value)).length;
    expect(jsonBytes(value, bytes)).toBe(bytes);
    expect(() => jsonBytes(value, bytes - 1)).toThrow();
  });
  it.each([undefined, NaN, Infinity, 1n, new Date(), new Map(), () => 1, [undefined], Array(2), { x: undefined }])('rejects non-JSON case %#', value => {
    expect(() => jsonBytes(value)).toThrow();
  });
  it('rejects accessors without invoking them, cycles and excessive nesting', () => {
    let invoked = false;
    expect(() => jsonBytes({ get value() { invoked = true; return 1; } })).toThrow();
    expect(invoked).toBe(false);
    const cycle = {}; Object.assign(cycle, { cycle });
    expect(() => jsonBytes(cycle)).toThrow();
    let nested: unknown = 0; for (let i = 0; i < 34; i++) nested = [nested];
    expect(() => jsonBytes(nested)).toThrow();
    expect(() => checkpoint({ value: 'x'.repeat(4096) })).toThrow();
  });
  it('allows shared JSON values but rejects symbols and sparse/decorated arrays', () => {
    const value = { x: 1 }; expect(jsonBytes([value, value])).toBeGreaterThan(0);
    expect(() => jsonBytes({ [Symbol('x')]: 1 })).toThrow();
    expect(() => jsonBytes(Object.assign([1], { extra: 2 }))).toThrow();
  });
  it('snapshots requests and rejects nonfinite limits/foreign or malformed heads', () => {
    const original: CanonicalRequest = { attemptId: 'a', expected: fixture(), operation: 'move', input: { x: 1 }, deadlineAt: null };
    const copy = request(original); original.expected.owner = 'mutated'; original.input = null;
    expect(copy.expected.owner).toBe('owner'); expect(copy.input).toEqual({ x: 1 });
    expect(() => request({ ...copy, deadlineAt: Infinity })).toThrow();
    expect(() => head(fixture(), { generation: 'elsewhere', gameId: 'game' })).toThrow();
    expect(() => head({ ...fixture(), status: 'oops' } as never)).toThrow();
    expect(() => head({ ...fixture(), roots: { world: null } } as never)).toThrow();
  });
});

describe('canonical logical quota and per-operation bounds', () => {
  it('charges a fixed-point head and only the appended records, without charging old head twice', () => {
    const first = accountHead(undefined, fixture(), 1000);
    expect(first.quota.usedBytes).toBe(1000 + storedBytes('heads', first.gameId, first));
    const next = accountHead(first, { ...first, revision: 1 }, 500);
    expect(next.quota.usedBytes).toBe(1500 + storedBytes('heads', next.gameId, next));
    expect(first.revision).toBe(0);
  });
  it('preserves recovery reserve and rejects even recovery above the hard logical limit', () => {
    const initial = fixture(); initial.quota = { usedBytes: 0, limitBytes: 70_000, reserveBytes: 65_536 };
    expect(() => accountHead(undefined, initial, 5000)).toThrow('quota');
    expect(accountHead(undefined, initial, 5000, true).quota.usedBytes).toBeGreaterThan(5000);
    expect(() => accountHead(undefined, initial, 70_000, true)).toThrow('quota');
    expect(() => head({ ...initial, quota: { ...initial.quota, reserveBytes: 0 } })).toThrow();
  });
  it('bounds read/write work and honors cancellation', () => {
    const cap = { reads: 1, writes: 1, bytes: 8 }, b = workBudget(cap); cap.reads = 1000;
    b.read(4); b.write(4); expect(b.snapshot()).toEqual({ reads: 1, writes: 1, readBytes: 4, writeBytes: 4 });
    expect(() => b.read(0)).toThrow('budget');
    expect(() => workBudget({ reads: 0, writes: 1, bytes: 1 })).toThrow();
    const signal = new AbortController(); signal.abort(); expect(() => workBudget(undefined, signal.signal).alive()).toThrow('cancelled');
  });
});
