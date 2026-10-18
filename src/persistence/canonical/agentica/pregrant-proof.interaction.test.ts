// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { loadOriginalAction } from './actions.original';
import { loadDecisionClaim } from './decision.claim';
import { loadLaunchTerminal } from './launch.terminal';
import type { OperationRead } from './operation.types';
import { loadPregrantStop } from './pregrant-proof.records';
import { readPublicationSelection } from './publication-selection.records';
import { loadRunGrant } from './run-grant.read';
import { protocolAction } from './types.test-support';
import { prepareAction } from './validation';

vi.mock('./actions.original', () => ({ loadOriginalAction: vi.fn() }));
vi.mock('./decision.claim', () => ({ loadDecisionClaim: vi.fn() }));
vi.mock('./launch.terminal', () => ({ loadLaunchTerminal: vi.fn() }));
vi.mock('./operation.binding', () => ({ assertBoundAction: vi.fn(), captureOperationBinding: (v: unknown) => v }));
vi.mock('./publication-selection.records', () => ({ readPublicationSelection: vi.fn() }));
vi.mock('./run-grant.read', () => ({ loadRunGrant: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

async function fixture(capabilityId: string) {
  const parent = await prepareAction({ ...protocolAction(), capabilityId: 'maze.navigate' });
  const pending = await prepareAction({ ...protocolAction(), actionId: 'child-action', runId: 'child-run', capabilityId });
  const binding = { grant: { key: 'agentica/grant', id: 'grant' }, publication: { key: 'agentica/pub', id: 'pub' } };
  const bound = { operation: { state: 'admitted' }, launch: { binding: { launchId: 'launch' }, guard: { id: 'root', admissionAttemptId: 'root-admit' },
    run: { value: { data: { started: { runId: 'initial-run' } } } } }, start: { capabilities: [{ id: capabilityId }] } };
  const claim = { reference: { key: 'agentica/claim', id: 'claim' }, data: { started: { runId: 'child-run', sessionId: pending.action.sessionId,
    sessionEpoch: pending.action.sessionEpoch, manifestHash: pending.action.manifestHash } }, decision: { terminal: { bound },
    data: { binding, event: { observation: { revision: 7 } } }, publication: { wireRevision: 7, epoch: 1 }, row: { revision: 10 } } };
  vi.mocked(loadDecisionClaim).mockResolvedValue(claim as unknown as NonNullable<Awaited<ReturnType<typeof loadDecisionClaim>>>);
  vi.mocked(loadLaunchTerminal).mockResolvedValue({ guardId: 'root', admissionAttemptId: 'root-admit', terminal: { receipt: { beforeRevision: 15 } } } as unknown as
    Awaited<ReturnType<typeof loadLaunchTerminal>>);
  vi.mocked(readPublicationSelection).mockResolvedValue({ row: { revision: 12 }, value: { data: { grant: binding.grant } } } as unknown as
    NonNullable<Awaited<ReturnType<typeof readPublicationSelection>>>);
  vi.mocked(loadRunGrant).mockResolvedValue({ launch: { binding: { launchId: 'launch' } }, started: { runId: 'initial-run' } } as unknown as
    Awaited<ReturnType<typeof loadRunGrant>>);
  vi.mocked(loadOriginalAction).mockResolvedValue(null);
  const liveOperation = vi.fn(async () => undefined), pages = { get: vi.fn(async () => null), liveOperation } as unknown as OperationRead;
  return { liveOperation, pending, load: () => loadPregrantStop(pages, parent, binding, pending) };
}

it.each(['maze.navigate', 'maze.explore', 'maze.inspect', 'maze.interact'])('checks the exact operation namespace for pending %s', async capability => {
  const f = await fixture(capability); await f.load();
  expect(f.liveOperation).toHaveBeenCalledExactlyOnceWith(`${capability === 'maze.interact' ? 'interact' : 'travel'}-${f.pending.storageKey.slice(-64)}`);
});

it('a retained interaction operation defeats no-effect proof even when the action record is absent', async () => {
  const f = await fixture('maze.interact'); f.liveOperation.mockResolvedValue({ id: 'retained' } as never);
  await expect(f.load()).rejects.toThrow('already has an operation');
});

it('a corrupt operation cannot be interpreted as absence', async () => {
  const f = await fixture('maze.interact'); f.liveOperation.mockRejectedValue(new Error('corrupt operation source'));
  await expect(f.load()).rejects.toThrow('corrupt operation source');
});
