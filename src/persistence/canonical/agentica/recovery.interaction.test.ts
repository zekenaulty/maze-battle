// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { readCanonical } from '../read';
import { canonicalFence } from '../transaction';
import { loadDecisionClaim } from './decision.claim';
import { loadDecisionIntent } from './decision.records';
import { loadOperationBinding } from './operation.binding';
import { inRecoveryDatabase } from './recovery.database';
import { inspectAgenticaRecovery } from './recovery.inspect';
import { recoveryOriginal, recoveryPointers } from './recovery.records';
import { loadAgenticaTerminal } from './terminal';
import { protocolAction, protocolHead } from './types.test-support';
import { prepareAction } from './validation';

vi.mock('../read', () => ({ readCanonical: vi.fn() }));
vi.mock('./decision.claim', () => ({ loadDecisionClaim: vi.fn() }));
vi.mock('./decision.records', () => ({ loadDecisionIntent: vi.fn() }));
vi.mock('./operation.binding', async original => ({ ...await original<typeof import('./operation.binding')>(), loadOperationBinding: vi.fn() }));
vi.mock('./recovery.database', () => ({ inRecoveryDatabase: vi.fn() }));
vi.mock('./recovery.records', () => ({ recoveryOriginal: vi.fn(), recoveryPointers: vi.fn() }));
vi.mock('./terminal', () => ({ loadAgenticaTerminal: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

async function fixture() {
  const head = protocolHead(), fence = canonicalFence(head), identity = await prepareAction({ ...protocolAction(), capabilityId: 'maze.interact' });
  const candidate = { operationId: `interact-${identity.storageKey.slice(-64)}`, original: { key: identity.storageKey, id: 'original' },
    binding: { grant: { key: 'agentica/grant', id: 'grant' }, publication: { key: 'agentica/pub', id: 'pub' } } };
  vi.mocked(recoveryOriginal).mockResolvedValue({ identity, candidate });
  vi.mocked(inRecoveryDatabase).mockImplementation(async (_signal, work) => work(new AbortController().signal));
  vi.mocked(readCanonical).mockImplementation(async work => ({ head, value: await work({} as never, {} as never), stats: {} } as never));
  vi.mocked(loadOperationBinding).mockResolvedValue({ operation: { id: candidate.operationId, state: 'admitted' },
    launch: { binding: { launchId: 'launch' } }, progress: { sequence: 0, status: 'pending' } } as unknown as Awaited<ReturnType<typeof loadOperationBinding>>);
  vi.mocked(recoveryPointers).mockResolvedValue({ active: null, selected: null, claimed: null });
  vi.mocked(loadAgenticaTerminal).mockResolvedValue(null);
  vi.mocked(loadDecisionClaim).mockResolvedValue(null);
  vi.mocked(loadDecisionIntent).mockResolvedValue(null);
  return { fence, candidate };
}

it('inspects only the exact interaction ID reconstructed from the original action', async () => {
  const f = await fixture(), inspection = await inspectAgenticaRecovery(f.fence, f.candidate);
  expect(inspection.candidate).toEqual(f.candidate);
  expect(inspection.pendingRemoteActions).toBe('unknown');
});

it('a syntactically valid travel ID cannot substitute for an interaction original', async () => {
  const f = await fixture();
  await expect(inspectAgenticaRecovery(f.fence, { ...f.candidate, operationId: f.candidate.operationId.replace('interact-', 'travel-') }))
    .rejects.toThrow('original binding changed');
  expect(loadOperationBinding).not.toHaveBeenCalled();
});

it.each(['other-', 'interact-', 'travel-', 'interact-' + 'g'.repeat(64)])('rejects malformed ID %s before opening recovery storage', async operationId => {
  const f = await fixture();
  await expect(inspectAgenticaRecovery(f.fence, { ...f.candidate, operationId })).rejects.toThrow('identity changed');
  expect(inRecoveryDatabase).not.toHaveBeenCalled();
});
