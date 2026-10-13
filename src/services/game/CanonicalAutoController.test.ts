import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanonicalAutoController, type CanonicalAutoSession } from './CanonicalAutoController';
import { controllerFixture, deferred } from '../../hooks/canonicalHooks.test-support';
import type { CanonicalReceipt } from '../../persistence/canonical/types';

afterEach(() => vi.useRealTimers());
async function setup() {
  const f = await controllerFixture(); f.publish(0, 'auto-play');
  const session = { owner: 'owner', view: { game: { ...f.controller.view.game, autoThrottleMs: 100 }, controlled: true, busy: false, recoveryRequired: false },
    execute: vi.fn<CanonicalAutoSession['execute']>() };
  const receipt = () => ({ ...f.receipt(), beforeRevision: session.view.game.snapshot.revision - 1,
    afterRevision: session.view.game.snapshot.revision, result: { outcome: 'applied', reason: 'Walking' } });
  session.execute.mockImplementation(async () => { session.view.game.snapshot.revision++; return receipt(); });
  vi.useFakeTimers(); const changed = vi.fn(), runner = new CanonicalAutoController(session, changed); runner.update(false);
  return { session, receipt, runner, changed };
}
describe('canonical Auto scheduling', () => {
  it('awaits one tick and uses the published revision for the next, respecting throttle', async () => {
    const { session, runner, receipt } = await setup(), pending = deferred<CanonicalReceipt>();
    session.execute.mockReturnValueOnce(pending.promise);
    await vi.advanceTimersByTimeAsync(1000); expect(session.execute).toHaveBeenCalledTimes(1);
    expect(session.execute).toHaveBeenCalledWith('auto', { kind: 'tick', revision: 2 });
    session.view.game.snapshot.revision++; pending.resolve(receipt()); await vi.advanceTimersByTimeAsync(99);
    expect(session.execute).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(session.execute).toHaveBeenLastCalledWith('auto', { kind: 'tick', revision: 3 }); runner.dispose();
  });
  it.each(['manual', 'dialog', 'floor', 'id', 'generation', 'owner', 'custody', 'recovery', 'dispose'])('cancels an in-flight continuation for %s', async reason => {
    const { session, runner, receipt } = await setup(), pending = deferred<CanonicalReceipt>();
    session.execute.mockReturnValueOnce(pending.promise); await vi.advanceTimersByTimeAsync(100);
    if (reason === 'manual') runner.cancel();
    if (reason === 'floor') session.view.game.checkpoint.position.level++;
    if (reason === 'id') session.view.game.id = 'different';
    if (reason === 'generation') session.view.game.snapshot.generation = 'different';
    if (reason === 'owner') session.owner = 'different';
    if (reason === 'custody') session.view.controlled = false;
    if (reason === 'recovery') session.view.recoveryRequired = true;
    if (reason === 'dispose') runner.dispose(); else runner.update(reason === 'dialog');
    session.view.game.snapshot.revision++; pending.resolve(receipt()); await vi.advanceTimersByTimeAsync(1000);
    expect(session.execute).toHaveBeenCalledTimes(1); runner.dispose();
  });
  it.each(['blocked', 'stale', 'throw', 'wrong-revision'])('does not retry %s with a new attempt', async outcome => {
    const { session, runner, receipt, changed } = await setup();
    session.execute.mockImplementationOnce(async () => {
      if (outcome === 'throw') throw Error('Storage failed');
      session.view.game.snapshot.revision++;
      return { ...receipt(), beforeRevision: outcome === 'wrong-revision' ? 0 : 2, result: { outcome, reason: 'Stopped' } };
    });
    await vi.advanceTimersByTimeAsync(1000); expect(session.execute).toHaveBeenCalledTimes(1); expect(changed).toHaveBeenCalled(); runner.dispose();
  });
  it('waits while busy and requires a fresh Auto activation after explicit cancellation', async () => {
    const { session, runner } = await setup(); session.view.busy = true;
    await vi.advanceTimersByTimeAsync(500); expect(session.execute).not.toHaveBeenCalled();
    session.view.busy = false; runner.update(false); await vi.advanceTimersByTimeAsync(100);
    runner.cancel(); runner.update(false); await vi.advanceTimersByTimeAsync(500); expect(session.execute).toHaveBeenCalledTimes(1);
    session.view.game.mode = 'manual'; runner.update(false); session.view.game.mode = 'auto-play'; runner.update(false);
    await vi.advanceTimersByTimeAsync(100); expect(session.execute).toHaveBeenCalledTimes(2); runner.dispose();
  });
  it('releases the pending slot for a fresh activation without resuming the cancelled one', async () => {
    const { session, runner, receipt } = await setup(), pending = deferred<CanonicalReceipt>();
    session.execute.mockReturnValueOnce(pending.promise); await vi.advanceTimersByTimeAsync(100);
    session.view.game.mode = 'manual'; runner.update(false);
    session.view.game.mode = 'auto-play'; runner.update(false);
    await vi.advanceTimersByTimeAsync(500); expect(session.execute).toHaveBeenCalledTimes(1);
    session.view.game.snapshot.revision++; pending.resolve(receipt()); await vi.advanceTimersByTimeAsync(100);
    expect(session.execute).toHaveBeenCalledTimes(2); runner.dispose();
  });
});
