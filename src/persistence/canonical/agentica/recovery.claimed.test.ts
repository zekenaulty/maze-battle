// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claimedParentKey, claimedParentValue } from './decision.claim.locator';
import { readClaimedParent } from './recovery.claimed';
import type { OperationRead } from './operation.types';
const mocks = vi.hoisted(() => ({ claim: vi.fn(), original: vi.fn() }));
vi.mock('./decision.claim', () => ({ loadDecisionClaim: mocks.claim }));
vi.mock('./validation', async importOriginal => ({ ...await importOriginal<typeof import('./validation')>(), restoreRetainedAction: mocks.original }));

const original = { key: `agentica/actions/${'a'.repeat(64)}`, id: 'original' };
const binding = { grant: { key: 'agentica/grant', id: 'grant' }, publication: { key: 'agentica/publication', id: 'publication' } };
const active = { id: 'root', sourceAttemptId: 'root-admission' };
function fixture() {
  const pointer = { id: 'locator', revision: 20, indexes: [], value: claimedParentValue('root', 'claim-source', original, binding) };
  const claim = { data: { locatorId: 'locator' }, row: { revision: 20 }, source: { attemptId: 'claim-source' }, decision: {
    data: { binding: structuredClone(binding) }, terminal: { bound: { original: { reference: structuredClone(original) },
      launch: { binding: { launchId: 'root' }, guard: { admissionAttemptId: 'root-admission' } }, operation: { id: 'travel-original' } } } } };
  const get = vi.fn().mockResolvedValue(pointer), pages = { get } as unknown as OperationRead;
  mocks.claim.mockResolvedValue(claim); mocks.original.mockResolvedValue('validated-original');
  return { pointer, claim, get, pages };
}
beforeEach(() => vi.clearAllMocks());
describe('active-root claimed parent locator', () => {
  it('does not fall back to history when the active root has no locator', async () => {
    const f = fixture(); f.get.mockResolvedValue(undefined);
    expect(await readClaimedParent(f.pages, active)).toBeNull();
    expect(f.get.mock.calls).toEqual([['execution', claimedParentKey(active.id)]]);
    expect(mocks.claim).not.toHaveBeenCalled(); expect(mocks.original).not.toHaveBeenCalled();
  });
  it('derives only the exact candidate from validated original and claim', async () => {
    const f = fixture(); expect(await readClaimedParent(f.pages, active)).toEqual({ operationId: 'travel-original', original, binding });
    expect(mocks.original).toHaveBeenCalledWith(f.pages, original, binding);
    expect(mocks.claim).toHaveBeenCalledWith(f.pages, 'validated-original');
    expect(f.get).toHaveBeenCalledTimes(1);
  });
  it.each(['claim', 'root', 'root-source', 'original', 'binding', 'pointer-root', 'pointer-source', 'revision', 'locator', 'indexes'])
  ('fails closed on changed %s', async kind => {
    const f = fixture();
    if (kind === 'claim') mocks.claim.mockResolvedValue(null);
    if (kind === 'root') f.claim.decision.terminal.bound.launch.binding.launchId = 'foreign';
    if (kind === 'root-source') f.claim.decision.terminal.bound.launch.guard.admissionAttemptId = 'foreign';
    if (kind === 'original') f.claim.decision.terminal.bound.original.reference.id = 'foreign';
    if (kind === 'binding') f.claim.decision.data.binding.grant.id = 'foreign';
    if (kind === 'pointer-root') f.pointer.value.launchId = 'foreign';
    if (kind === 'pointer-source') f.pointer.value.sourceAttemptId = 'foreign';
    if (kind === 'revision') f.pointer.revision--;
    if (kind === 'locator') f.claim.data.locatorId = 'foreign';
    if (kind === 'indexes') Object.assign(f.pointer, { indexes: ['foreign'] });
    await expect(readClaimedParent(f.pages, active)).rejects.toThrow();
  });
  it.each(['original', 'claim'] as const)('propagates immutable %s proof refusal', async kind => {
    mocks[kind].mockRejectedValueOnce(Error('invalid immutable source'));
    await expect(readClaimedParent(fixture().pages, active)).rejects.toThrow('invalid immutable source');
  });
});
