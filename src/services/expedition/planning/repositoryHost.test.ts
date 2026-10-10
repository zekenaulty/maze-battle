// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claimStreamControl, executeStreamAction, loadStreamAction, loadStreamControl, loadStreamSnapshot } from '../../../persistence/streamRepository';
import { ensureStreamPublicScope } from '../../../persistence/streamPublicScope';
import { loadTopologyHeader } from '../../../persistence/topologyRepository';
import { DEFAULT_PLANNING_LIMITS, PLANNING_PROTOCOL } from './contracts';
import { openRepositoryPlanningSession, reconcileRepositoryAction } from './repositoryHost';
import { deferred, planningFixture } from './testSupport';

vi.mock('../../../persistence/streamRepository', () => ({
  claimStreamControl: vi.fn(), executeStreamAction: vi.fn(), loadStreamAction: vi.fn(),
  loadStreamControl: vi.fn(), loadStreamSnapshot: vi.fn(),
}));
vi.mock('../../../persistence/streamPublicScope', () => ({ ensureStreamPublicScope: vi.fn() }));
vi.mock('../../../persistence/topologyRepository', () => ({ loadTopologyHeader: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

/** Repository I/O/CAS is mocked; session, projection, and command transitions are real. */
function repository() {
  const fixture = planningFixture();
  const state = { control: { sessionId: 'human', epoch: 10 } };
  vi.mocked(loadStreamSnapshot).mockImplementation(async () => {
    const view = await fixture.host.read();
    return { checkpoint: view.checkpoint, observation: view.observation, room: fixture.world.room() };
  });
  vi.mocked(loadStreamControl).mockImplementation(async () => structuredClone(state.control));
  vi.mocked(claimStreamControl).mockImplementation(async (_slot, sessionId, expectedEpoch) => {
    if (expectedEpoch !== state.control.epoch) throw new Error('Control epoch conflict');
    state.control = { sessionId, epoch: expectedEpoch + 1 };
    return structuredClone(state.control);
  });
  vi.mocked(ensureStreamPublicScope).mockResolvedValue(fixture.binding.scopeId);
  vi.mocked(loadStreamAction).mockImplementation(async (_slot, request) => {
    if (typeof request === 'string') throw new Error('Expected exact original request');
    return fixture.host.lookup(request);
  });
  vi.mocked(executeStreamAction).mockImplementation(async (_slot, request) => {
    expect([request.sessionId, request.epoch]).toEqual([state.control.sessionId, state.control.epoch]);
    return fixture.host.execute(request);
  });
  vi.mocked(loadTopologyHeader).mockImplementation(async () => ({ header: fixture.world.topology.header(),
    publicScopeId: fixture.binding.scopeId, quotaBytes: 1_000_000, serializedBytes: 1000, streamVersion: 1 }));
  return { fixture, state };
}
const open = (limits = { ...DEFAULT_PLANNING_LIMITS }) => openRepositoryPlanningSession('review', 'run', 'explore', limits);

describe('repository planning ownership boundary', () => {
  it.each(['read', 'claim'] as const)('pins limits before an outstanding %s allows caller mutation', async stage => {
    repository(); const entered = deferred<void>(); const gate = deferred<void>();
    if (stage === 'read') {
      const read = vi.mocked(loadStreamSnapshot).getMockImplementation()!;
      vi.mocked(loadStreamSnapshot).mockImplementationOnce(async (...args) => {
        entered.resolve(); await gate.promise; return read(...args);
      });
    } else {
      const claim = vi.mocked(claimStreamControl).getMockImplementation()!;
      vi.mocked(claimStreamControl).mockImplementationOnce(async (...args) => {
        const result = await claim(...args); entered.resolve(); await gate.promise; return result;
      });
    }
    const limits = { ...DEFAULT_PLANNING_LIMITS }; const pending = open(limits);
    await entered.promise; limits.actions = 0; gate.resolve();
    const session = await pending;
    expect(await session.start()).toMatchObject({ type: 'start', limits: DEFAULT_PLANNING_LIMITS });
    await session.cancel();
  });

  it('rejects initially invalid configuration without claiming control', async () => {
    const { state } = repository();
    await expect(open({ ...DEFAULT_PLANNING_LIMITS, actions: 0 })).rejects.toThrow();
    await expect(openRepositoryPlanningSession('review', '', 'explore')).rejects.toThrow();
    expect(claimStreamControl).not.toHaveBeenCalled();
    expect(state.control).toEqual({ sessionId: 'human', epoch: 10 });
  });

  it('shares one release attempt between concurrent cancellations', async () => {
    repository(); const session = await open();
    const entered = deferred<void>(); const gate = deferred<void>();
    const read = vi.mocked(loadStreamControl).getMockImplementation()!;
    vi.mocked(loadStreamControl).mockClear().mockImplementationOnce(async (...args) => {
      const control = await read(...args); entered.resolve(); await gate.promise; return control;
    });
    vi.mocked(claimStreamControl).mockClear();
    const first = session.cancel(); await entered.promise;
    const results = Promise.allSettled([first, session.cancel()]); gate.resolve();
    expect((await results).map(value => value.status)).toEqual(['fulfilled', 'fulfilled']);
    await session.cancel();
    expect(loadStreamControl).toHaveBeenCalledTimes(1);
    expect(claimStreamControl).toHaveBeenCalledTimes(1);
  });

  it('keeps a failed release visible and permits an explicit retry while remaining closed', async () => {
    repository(); const session = await open();
    vi.mocked(claimStreamControl).mockClear().mockRejectedValueOnce(new Error('Storage unavailable'));
    const results = await Promise.allSettled([session.cancel(), session.cancel()]);
    expect(results.map(value => value.status)).toEqual(['rejected', 'rejected']);
    expect(claimStreamControl).toHaveBeenCalledTimes(1);
    expect(session.diagnostics.closed).toBe(true);
    await expect(session.cancel()).resolves.toMatchObject({ type: 'outcome', status: 'cancelled' });
    expect(claimStreamControl).toHaveBeenCalledTimes(2);
  });

  it('does not replace a human owner who wins the release CAS race', async () => {
    const { state } = repository(); const session = await open();
    const claim = vi.mocked(claimStreamControl).getMockImplementation()!;
    vi.mocked(claimStreamControl).mockImplementationOnce(async (...args) => {
      state.control = { sessionId: 'new-human', epoch: state.control.epoch + 1 };
      return claim(...args);
    });
    await expect(session.cancel()).rejects.toThrow('Control epoch conflict');
    await expect(session.cancel()).resolves.toMatchObject({ status: 'cancelled' });
    expect(state.control).toEqual({ sessionId: 'new-human', epoch: 12 });
    expect(claimStreamControl).toHaveBeenCalledTimes(2);
  });

  it('cannot publish start after cancellation while its snapshot read is outstanding', async () => {
    repository(); const session = await open();
    const entered = deferred<void>(); const gate = deferred<void>();
    const read = vi.mocked(loadStreamSnapshot).getMockImplementation()!;
    vi.mocked(loadStreamSnapshot).mockImplementationOnce(async (...args) => {
      const snapshot = await read(...args); entered.resolve(); await gate.promise; return snapshot;
    });
    const pending = session.start(); await entered.promise; await session.cancel(); gate.resolve();
    expect((await pending).type).toBe('error');
    expect(executeStreamAction).not.toHaveBeenCalled();
  });

  it('retains the compact internal receipt without relabeling a failed current frame as original evidence', async () => {
    repository(); const session = await open(); const start = await session.start();
    if (start.type !== 'start') throw new Error('Expected start');
    const request = { protocol: PLANNING_PROTOCOL, binding: start.binding, type: 'action.request', actionId: 'move-0',
      expectedRevision: 0, expectedTopologyRevision: 0, command: { type: 'move', direction: 'north' } };
    const execute = vi.mocked(executeStreamAction).getMockImplementation()!;
    vi.mocked(executeStreamAction).mockImplementationOnce(async (...args) => {
      const result = await execute(...args);
      vi.mocked(loadStreamSnapshot).mockRejectedValue(new Error('Projection unavailable'));
      return result;
    });
    const response = await session.handle(JSON.stringify(request));
    expect(response).toMatchObject({ type: 'action.result', result: { actionId: 'move-0', disposition: 'applied' } });
    expect(response).not.toHaveProperty('frame');
    const replay = await reconcileRepositoryAction('review', JSON.stringify({ ...request, type: 'action.query' }));
    if (response.type !== 'action.result') throw new Error('Expected result');
    expect(replay).toEqual(response.result);
    expect(replay).not.toHaveProperty('observation');
    expect(executeStreamAction).toHaveBeenCalledTimes(1);
  });
});
