import { beforeEach, describe, expect, it, vi } from 'vitest';
import { workBudget } from './budget';
import { operationAt } from './operations';
import { requireResetClearance } from './resetGuard';
import { ACKNOWLEDGEMENT_BYTES, DEFAULT_QUOTA, type CanonicalHead, type CanonicalWrite } from './types';

vi.mock('./operations', () => ({ operationAt: vi.fn() }));
const current = (): CanonicalHead => ({ schema: 1, generation: 'generation', gameId: 'game', owner: 'owner', epoch: 1, revision: 2,
  status: 'ready', roots: { world: null, knowledge: null, execution: null }, checkpoint: {}, allocations: {},
  quota: { ...DEFAULT_QUOTA, usedBytes: 100, reservedBytes: 0, reservations: 0 } });
function fixture(row = current(), schema: unknown = { schema: 1, generation: 'generation', gameId: 'game' }) {
  const get = vi.fn(async (key: string) => key === 'schema' ? schema : row), cursor = vi.fn(async () => null);
  const store = vi.fn(() => ({ get, openKeyCursor: cursor }));
  return { tx: { objectStore: store } as unknown as CanonicalWrite, get, cursor, store };
}
function funded(id: string) {
  const row = current(); row.allocations[id] = { revision: 2, bytes: ACKNOWLEDGEMENT_BYTES };
  Object.assign(row.quota, { reservations: 1, reservedBytes: ACKNOWLEDGEMENT_BYTES }); return row;
}
beforeEach(() => vi.resetAllMocks());

describe('transactional reset guard', () => {
  it('uses only the marker and compact current head when no allocations remain', async () => {
    const f = fixture(), budget = workBudget(); await requireResetClearance(f.tx, budget);
    expect(f.get.mock.calls).toEqual([['schema'], ['game']]); expect(operationAt).not.toHaveBeenCalled();
    expect(budget.snapshot()).toMatchObject({ reads: 2, writes: 0 });
  });
  it.each(['agentica-launch:root', 'travel-navigation', 'no-prefix'])('refuses the exact verified-host policy for %s', async id => {
    const f = fixture(funded(id)); vi.mocked(operationAt).mockResolvedValue({ ackPolicy: 'verified-host' } as never);
    await expect(requireResetClearance(f.tx, workBudget())).rejects.toThrow('exact acknowledgement');
    expect(operationAt).toHaveBeenCalledExactlyOnceWith(f.tx, expect.any(Object), id, expect.any(Object));
  });
  it('does not infer host policy from an operation ID or binding', async () => {
    const f = fixture(funded('agentica-launch:local'));
    vi.mocked(operationAt).mockResolvedValue({ binding: { kind: 'agentica-launch' } } as never);
    await expect(requireResetClearance(f.tx, workBudget())).resolves.toBeUndefined();
  });
  it('propagates operation corruption rather than treating it as clearance', async () => {
    const f = fixture(funded('operation')); vi.mocked(operationAt).mockRejectedValue(Error('source receipt changed'));
    await expect(requireResetClearance(f.tx, workBudget())).rejects.toThrow('source receipt changed');
  });
  it('refuses malformed allocation accounting without querying history', async () => {
    const row = funded('operation'); row.quota.reservations = 0;
    await expect(requireResetClearance(fixture(row).tx, workBudget())).rejects.toThrow('quota');
    expect(operationAt).not.toHaveBeenCalled();
  });
  it('allows a fresh empty schema but refuses a null marker hiding a retained head', async () => {
    const f = fixture(current(), { schema: 1, generation: 'generation', gameId: null });
    await requireResetClearance(f.tx, workBudget()); expect(f.get).toHaveBeenCalledExactlyOnceWith('schema');
    f.cursor.mockResolvedValue({ key: 'game' } as never);
    await expect(requireResetClearance(f.tx, workBudget())).rejects.toThrow('uninitialized marker has retained heads');
  });
  it('checks its read budget before issuing the head read', async () => {
    const f = fixture();
    await expect(requireResetClearance(f.tx, workBudget({ reads: 1, writes: 10, bytes: 65536 }))).rejects.toThrow('read budget exhausted');
    expect(f.get).toHaveBeenCalledExactlyOnceWith('schema');
  });
});
