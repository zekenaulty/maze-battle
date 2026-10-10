// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claimStreamControl, executeStreamAction, loadStreamAction, loadStreamSnapshot } from '../../persistence/streamRepository';
import { openStreamRuntime, StreamRuntime, STREAM_SLOT } from './streamRuntime';
import { gate, reviewRepository } from './streamRuntime.review.testSupport';

vi.mock('../../persistence/streamRepository', () => ({
  createStreamSlot: vi.fn(), claimStreamControl: vi.fn(), executeStreamAction: vi.fn(),
  loadStreamAction: vi.fn(), loadStreamControl: vi.fn(), loadStreamSnapshot: vi.fn(),
}));

beforeEach(() => vi.resetAllMocks());

function setup() {
  const repository = reviewRepository();
  const publish = vi.fn();
  const runtime = new StreamRuntime(repository.snapshot, repository.owner, publish);
  return { repository, runtime, publish };
}

describe('stream runtime control race review', () => {
  it('plans only after takeover and the in-flight command have settled', async () => {
    const { repository, runtime } = setup();
    const entered = gate();
    const release = gate();
    const execute = vi.mocked(executeStreamAction).getMockImplementation()!;
    vi.mocked(executeStreamAction).mockImplementationOnce(async (...args) => {
      entered.resolve(); await release.promise; return execute(...args);
    });
    const first = runtime.automatic();
    await entered.promise;
    const takeover = runtime.takeOver();
    const resumed = runtime.automatic();
    release.resolve();
    expect((await first)?.disposition).toBe('applied');
    await takeover;
    expect((await resumed)?.disposition).toBe('applied');
    expect(vi.mocked(executeStreamAction).mock.calls.map(([, request]) => [request.command.type, request.expectedRevision, request.epoch]))
      .toEqual([['move', 0, 0], ['collect', 1, 1]]);
    expect(repository.snapshot.checkpoint.collectedChests).toBe(1);
  });

  it('drops a pre-takeover automatic call without cancelling the newer command', async () => {
    const { runtime } = setup();
    const entered = gate();
    const release = gate();
    const claim = vi.mocked(claimStreamControl).getMockImplementation()!;
    vi.mocked(claimStreamControl).mockImplementationOnce(async (...args) => {
      entered.resolve(); await release.promise; return claim(...args);
    });
    const firstTakeover = runtime.takeOver();
    await entered.promise;
    const stale = runtime.automatic();
    const secondTakeover = runtime.takeOver();
    const latest = runtime.dispatch({ type: 'move', direction: 'south' });
    release.resolve();
    await Promise.all([firstTakeover, secondTakeover]);
    expect(await stale).toBeUndefined();
    expect((await latest)?.disposition).toBe('applied');
    expect(executeStreamAction).toHaveBeenCalledTimes(1);
    expect(runtime.snapshot.checkpoint.position).toMatchObject({ row: 1, column: 0 });
  });

  it('does not stamp a queued stale manual intent with a newer revision', async () => {
    const { runtime } = setup();
    const entered = gate();
    const release = gate();
    const execute = vi.mocked(executeStreamAction).getMockImplementation()!;
    vi.mocked(executeStreamAction).mockImplementationOnce(async (...args) => {
      entered.resolve(); await release.promise; return execute(...args);
    });
    const active = runtime.dispatch({ type: 'move', direction: 'east' });
    await entered.promise;
    const takeover = runtime.takeOver();
    const stale = runtime.dispatch({ type: 'move', direction: 'east' });
    release.resolve();
    await active;
    await takeover;
    expect(await stale).toBeUndefined();
    expect(executeStreamAction).toHaveBeenCalledTimes(1);
    expect(runtime.snapshot.checkpoint.position).toMatchObject({ row: 0, column: 1 });
  });

  it('fails closed after rejected takeover without submitting any action', async () => {
    const { runtime, publish } = setup();
    vi.mocked(claimStreamControl).mockRejectedValueOnce(new Error('Lost ownership.'));
    await expect(runtime.takeOver()).rejects.toThrow('Lost ownership');
    expect(runtime.faulted).toBe(true);
    await expect(runtime.automatic()).rejects.toThrow('Lost ownership');
    await expect(runtime.dispatch({ type: 'move', direction: 'east' })).rejects.toThrow('Lost ownership');
    expect(executeStreamAction).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('admits only one automatic decision when two calls share a pending control barrier', async () => {
    const { runtime } = setup();
    const entered = gate();
    const release = gate();
    const claim = vi.mocked(claimStreamControl).getMockImplementation()!;
    vi.mocked(claimStreamControl).mockImplementationOnce(async (...args) => {
      entered.resolve(); await release.promise; return claim(...args);
    });
    const takeover = runtime.takeOver();
    await entered.promise;
    const results = Promise.all([runtime.automatic(), runtime.automatic()]);
    release.resolve();
    await takeover;
    expect((await results).filter(Boolean)).toHaveLength(1);
    expect(executeStreamAction).toHaveBeenCalledTimes(1);
  });

  it('fences a stale external owner and publishes only the canonical snapshot', async () => {
    const { repository, runtime, publish } = setup();
    await claimStreamControl(STREAM_SLOT, 'replacement', repository.owner.epoch);
    expect((await runtime.dispatch({ type: 'move', direction: 'east' }))?.disposition).toBe('conflict');
    expect(runtime.faulted).toBe(true);
    expect(runtime.snapshot.checkpoint.revision).toBe(0);
    expect(publish).toHaveBeenLastCalledWith(repository.snapshot);
    expect(await runtime.automatic()).toBeUndefined();
    expect(executeStreamAction).toHaveBeenCalledTimes(1);
  });

  it.each(['move', 'refusal'] as const)('recovers a lost %s acknowledgement from the exact original receipt, without retrying', async kind => {
    const { repository, runtime, publish } = setup();
    const execute = vi.mocked(executeStreamAction).getMockImplementation()!;
    vi.mocked(executeStreamAction).mockImplementationOnce(async (...args) => {
      await execute(...args); throw new Error('Acknowledgement lost.');
    });
    const result = await runtime.dispatch({ type: 'move', direction: kind === 'move' ? 'east' : 'north' });
    expect(result?.disposition).toBe(kind === 'move' ? 'applied' : 'refused');
    const request = vi.mocked(executeStreamAction).mock.calls[0][1];
    expect(loadStreamAction).toHaveBeenCalledExactlyOnceWith(STREAM_SLOT, request);
    expect(executeStreamAction).toHaveBeenCalledTimes(1);
    expect(repository.receipts.size).toBe(1);
    expect(runtime.faulted).toBe(false);
    expect(publish).toHaveBeenLastCalledWith(repository.snapshot);
  });

  it.each(['missing', 'query-failed'] as const)('does not retry an unknown acknowledgement when its receipt is %s', async failure => {
    const { repository, runtime, publish } = setup();
    const execute = vi.mocked(executeStreamAction).getMockImplementation()!;
    vi.mocked(executeStreamAction).mockImplementationOnce(async (...args) => {
      await execute(...args); throw new Error('Acknowledgement lost.');
    });
    if (failure === 'missing') vi.mocked(loadStreamAction).mockResolvedValueOnce(undefined);
    else vi.mocked(loadStreamAction).mockRejectedValueOnce(new Error('Receipt query failed.'));
    await expect(runtime.dispatch({ type: 'move', direction: 'east' })).rejects.toThrow('Acknowledgement lost');
    expect(runtime.faulted).toBe(true);
    expect(runtime.snapshot.checkpoint.revision).toBe(0);
    expect(repository.snapshot.checkpoint.revision).toBe(1);
    expect(publish).not.toHaveBeenCalled();
    expect(await runtime.automatic()).toBeUndefined();
    expect(executeStreamAction).toHaveBeenCalledTimes(1);
    const reloaded = await openStreamRuntime(() => false, vi.fn());
    expect(reloaded!.snapshot.checkpoint.revision).toBe(1);
    expect((await reloaded!.automatic())?.disposition).toBe('applied');
    expect(vi.mocked(executeStreamAction).mock.calls.map(([, request]) => request.command.type)).toEqual(['move', 'collect']);
    expect(repository.snapshot.checkpoint.moves).toBe(1);
    expect(repository.receipts.size).toBe(2);
  });

  it('does not retry a committed action if loading its snapshot fails', async () => {
    const { repository, runtime, publish } = setup();
    vi.mocked(loadStreamSnapshot).mockRejectedValueOnce(new Error('Snapshot unavailable.'));
    await expect(runtime.dispatch({ type: 'move', direction: 'east' })).rejects.toThrow('Snapshot unavailable');
    expect(runtime.faulted).toBe(true);
    expect(repository.snapshot.checkpoint.revision).toBe(1);
    expect(publish).not.toHaveBeenCalled();
    expect(await runtime.automatic()).toBeUndefined();
    expect(executeStreamAction).toHaveBeenCalledTimes(1);
  });
});
