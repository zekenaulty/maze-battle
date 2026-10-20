// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { canonicalFence, type CanonicalWork } from '../transaction';
import type { CanonicalRequest } from '../types';
import { readPublication } from './publication';
import { retainPublicationSelection } from './publication-selection';
import { readPublicationSelection } from './publication-selection.records';
import { protocolHead } from './types.test-support';
import type { Publication } from './types';

vi.mock('./publication', async original => ({
  ...await original<typeof import('./publication')>(), readPublication: vi.fn(),
}));
vi.mock('./publication-selection.records', async original => ({
  ...await original<typeof import('./publication-selection.records')>(), readPublicationSelection: vi.fn(),
}));
beforeEach(() => vi.clearAllMocks());

function fixture(operation: string, previous = false) {
  const head = protocolHead(), publication = {
    owner: head.owner, epoch: head.epoch,
    snapshot: { generation: head.generation, gameId: head.gameId, revision: head.revision,
      roots: { world: head.roots.world, knowledge: head.roots.knowledge }, checkpoint: head.checkpoint },
    // The publication codec is covered separately; this test isolates selection policy.
    objective: { launchId: 'launch' },
  } as Publication;
  vi.mocked(readPublication).mockResolvedValue(publication);
  const prior = { key: 'agentica/previous', id: 'previous-record' };
  vi.mocked(readPublicationSelection).mockResolvedValue(previous ? {
    ref: prior, value: { data: { grant: { key: 'old-grant', id: 'old' }, publication: { key: 'old-pub', id: 'old' } } },
  } as never : null);
  const set = vi.fn(async () => ({ id: 'new-pointer' })), put = vi.fn();
  const tx = { head, pages: { set } } as unknown as CanonicalWork;
  const request: CanonicalRequest = { expected: canonicalFence(head), operation, attemptId: 'select', input: {}, deadlineAt: null };
  const binding = { launchId: 'launch', grant: { key: 'agentica/grant', id: 'grant-record' },
    publication: { key: 'agentica/pub', id: 'pub-record' }, previousSelection: previous ? prior : null };
  return { publication, set, put, run: () => retainPublicationSelection(tx, request, binding, { put }) };
}

it('allows the typed owner choice only on the initial launch selection', async () => {
  const f = fixture('agentica.launch.grant');
  await f.run(); expect(f.set).toHaveBeenCalledTimes(1); expect(f.put).toHaveBeenCalledTimes(1);
});
it.each(['agentica.publication.renew', 'agentica.decision.grant', 'fixture.grant'])(
  'refuses a replacement typed choice during %s before any selection writes', async operation => {
    const f = fixture(operation, true);
    await expect(f.run()).rejects.toThrow('original launch publication only');
    expect(f.set).not.toHaveBeenCalled(); expect(f.put).not.toHaveBeenCalled();
  });
it.each(['launch', 'previous'])('refuses an initial typed choice with a different %s', async changed => {
  const f = fixture('agentica.launch.grant', changed === 'previous');
  if (changed === 'launch') f.publication.objective!.launchId = 'other';
  await expect(f.run()).rejects.toThrow('original launch publication only');
  expect(f.set).not.toHaveBeenCalled(); expect(f.put).not.toHaveBeenCalled();
});
it.each(['agentica.publication.renew', 'agentica.decision.grant'])('keeps ordinary %s publications unchanged', async operation => {
  const f = fixture(operation, true); delete f.publication.objective;
  await f.run(); expect(f.set).toHaveBeenCalledTimes(1); expect(f.put).toHaveBeenCalledTimes(1);
});
