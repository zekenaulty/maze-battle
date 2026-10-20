// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { assertLaunchGrant } from './launch.grant';
import { loadActiveLaunch } from './launch.read';
import type { LaunchGrantContext } from './launch.types';
import { readPublication } from './publication';
import { assertPublicationSelected } from './publication-selection';
import { loadRunGrant } from './run-grant.read';
import { protocolAction, protocolHead } from './types.test-support';
import type { Publication } from './types';
import type { ReturnObjective } from './objective.binding';

vi.mock('./launch.read', () => ({ loadActiveLaunch: vi.fn() }));
vi.mock('./run-grant.read', () => ({ loadRunGrant: vi.fn() }));
vi.mock('./publication-selection', () => ({ assertPublicationSelected: vi.fn() }));
vi.mock('./publication', async original => ({
  ...await original<typeof import('./publication')>(), readPublication: vi.fn(),
}));
beforeEach(() => vi.clearAllMocks());

function fixture(typed = true) {
  const head = protocolHead(), grantRef = { key: 'agentica/successor', id: 'child-grant' };
  const rootRef = { key: 'agentica/publications/root', id: 'root-record' };
  const selectedRef = { key: 'agentica/publications/current', id: 'current-record' };
  const objective: ReturnObjective = { schema: 1, kind: 'retrieve-return', launchId: 'launch', objectiveId: 'objective',
    quest: { ref: { key: 'quest/fetch', id: 'original-quest' }, questId: 'fetch', title: 'Return the relic',
      acceptedAt: '2026-10-20T00:00:00.000Z', item: { baseId: 'quest-relic', displayName: 'Relic', token: 'relic' } },
    entrance: { at: { level: 1, cell: { spaceId: 'entry', row: 0, column: 0 } }, source: { sequence: 1, id: 'first', index: 0 } } };
  const current = { owner: head.owner, epoch: head.epoch, wireRevision: head.revision,
    snapshot: { generation: head.generation, gameId: head.gameId, revision: head.revision, checkpoint: head.checkpoint,
      roots: { world: head.roots.world, knowledge: head.roots.knowledge } } } as Publication;
  vi.mocked(readPublication).mockResolvedValue(current);
  const action = { ...protocolAction(), deadlineAt: '2099-01-01T00:00:00.000Z' };
  const capability = { id: action.capabilityId, effect: 'readOnly' };
  vi.mocked(loadActiveLaunch).mockResolvedValue({ id: 'launch', sourceAttemptId: 'admission' });
  vi.mocked(loadRunGrant).mockResolvedValue({
    record: { ref: grantRef, value: { data: { owner: head.owner, epoch: head.epoch, guardRevision: 3 } } },
    launch: { binding: { launchId: 'launch', publication: rootRef, start: { capabilities: [capability] } },
      guard: { owner: head.owner, epoch: head.epoch, revision: 3, state: 'admitted', admissionAttemptId: 'admission' },
      publication: { ...(typed ? { objective } : {}) } },
    started: { runId: action.runId, manifestHash: action.manifestHash, sessionId: action.sessionId, sessionEpoch: action.sessionEpoch },
  } as never);
  const tx = { head, pages: { get: vi.fn(), sourceReceipt: vi.fn(), savedSnapshot: vi.fn() }, liveOperation: vi.fn() } as unknown as LaunchGrantContext;
  return { objective, rootRef, current, grantRef, selectedRef, tx, action,
    run: () => assertLaunchGrant(tx, grantRef, action, selectedRef) };
}

it('returns the root owner choice separately from the current successor publication', async () => {
  const f = fixture(), result = await f.run();
  expect(result.publication).toBe(f.current);
  expect(result.objective).toEqual({ publication: f.rootRef, value: f.objective });
  expect(assertPublicationSelected).toHaveBeenCalledWith(expect.anything(), 'launch', f.grantRef, f.selectedRef);
  f.rootRef.id = 'mutated'; f.objective.quest.item.token = 'mutated';
  expect(result.objective!.publication.id).toBe('root-record');
  expect(result.objective!.value.quest.item.token).toBe('relic');
});
it('does not infer a typed objective for ordinary free-text launches', async () => {
  expect(await fixture(false).run()).not.toHaveProperty('objective');
});
it('does not let typed objective context bypass current grant custody', async () => {
  const f = fixture(); f.tx.head.owner = 'different-owner';
  await expect(f.run()).rejects.toThrow('custody');
  expect(readPublication).not.toHaveBeenCalled();
});
