import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanonicalBattleController, type BattleScheduleView, type CanonicalBattleSession } from './CanonicalBattleController';
import type { CanonicalReceipt } from '../../persistence/canonical/types';
import { deferred } from '../../hooks/canonicalHooks.test-support';

afterEach(() => vi.useRealTimers());
function setup() {
  const game: BattleScheduleView = { id: 'game', snapshot: { generation: 'generation', revision: 1 },
    checkpoint: { position: { level: 1 } }, mode: 'battle', party: [{ autoBattle: true }, { autoBattle: false }],
    battle: { id: 'battle', status: 'active' }, autoThrottleMs: 100 };
  const session = { owner: 'owner', view: { game, controlled: true, busy: false, recoveryRequired: false },
    execute: vi.fn<CanonicalBattleSession['execute']>() };
  const receipt = (outcome = 'applied'): CanonicalReceipt => ({ generation: 'generation', gameId: 'game', attemptId: 'attempt',
    fingerprint: 'test', beforeRevision: game.snapshot.revision - 1, afterRevision: game.snapshot.revision,
    committedAt: new Date().toISOString(), result: { outcome } });
  session.execute.mockImplementation(async () => { game.snapshot.revision++; return receipt(); });
  vi.useFakeTimers(); const changed = vi.fn(), runner = new CanonicalBattleController(session, changed); runner.update(false);
  return { game, session, receipt, runner, changed };
}

describe('canonical battle scheduling', () => {
  it('awaits one command and uses the next published revision without enabling other actors', async () => {
    const { game, session, receipt, runner } = setup(), pending = deferred<CanonicalReceipt>();
    session.execute.mockReturnValueOnce(pending.promise);
    await vi.advanceTimersByTimeAsync(1000);
    expect(session.execute).toHaveBeenCalledExactlyOnceWith('combat', { kind: 'tick', battleId: 'battle', revision: 1 });
    game.snapshot.revision++; pending.resolve(receipt());
    await vi.advanceTimersByTimeAsync(99); expect(session.execute).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(session.execute).toHaveBeenLastCalledWith('combat', { kind: 'tick', battleId: 'battle', revision: 2 });
    expect(game.party).toEqual([{ autoBattle: true }, { autoBattle: false }]); runner.dispose();
  });
  it.each(['paused', 'all-off', 'lost', 'custody', 'recovery', 'blocked', 'dispose'] as const)('does not continue after %s', async reason => {
    const { game, session, receipt, runner } = setup(), pending = deferred<CanonicalReceipt>();
    session.execute.mockReturnValueOnce(pending.promise); await vi.advanceTimersByTimeAsync(100);
    if (reason === 'paused') game.battleAutomationPaused = true;
    if (reason === 'all-off') game.party.forEach(actor => { actor.autoBattle = false; });
    if (reason === 'lost') game.battle!.status = 'lost';
    if (reason === 'custody') session.view.controlled = false;
    if (reason === 'recovery') session.view.recoveryRequired = true;
    if (reason === 'dispose') runner.dispose(); else runner.update(reason === 'blocked');
    game.snapshot.revision++; pending.resolve(receipt()); await vi.advanceTimersByTimeAsync(1000);
    expect(session.execute).toHaveBeenCalledTimes(1); runner.dispose();
  });
  it('resumes after a dialog closes but never overrides the saved Stop policy', async () => {
    const { game, session, runner } = setup();
    runner.update(true); await vi.advanceTimersByTimeAsync(500); expect(session.execute).not.toHaveBeenCalled();
    runner.update(false); await vi.advanceTimersByTimeAsync(100); expect(session.execute).toHaveBeenCalledTimes(1);
    game.battleAutomationPaused = true; runner.update(false);
    await vi.advanceTimersByTimeAsync(500); expect(session.execute).toHaveBeenCalledTimes(1);
    game.battleAutomationPaused = false; runner.update(false);
    await vi.advanceTimersByTimeAsync(100); expect(session.execute).toHaveBeenCalledTimes(2); runner.dispose();
  });
  it('starts the next wave only after settlement publishes waves without a battle', async () => {
    const { game, session, runner } = setup();
    session.execute.mockImplementationOnce(async () => {
      game.battle = undefined; game.mode = 'waves'; game.snapshot.revision++;
      runner.update(false);
      return { generation: 'generation', gameId: 'game', attemptId: 'win', fingerprint: 'test', beforeRevision: 1,
        afterRevision: 2, committedAt: new Date().toISOString(), result: { outcome: 'applied' } };
    });
    await vi.advanceTimersByTimeAsync(200);
    expect(session.execute).toHaveBeenNthCalledWith(2, 'combat', { kind: 'start', returnMode: 'waves', revision: 2 });
    runner.dispose();
  });
  it.each(['stale', 'refused', 'wrong-revision', 'throw'] as const)('halts %s rather than retrying an uncertain command', async failure => {
    const { game, session, receipt, runner, changed } = setup();
    session.execute.mockImplementationOnce(async () => {
      if (failure === 'throw') throw Error('Storage failed');
      game.snapshot.revision++;
      return { ...receipt(failure), beforeRevision: failure === 'wrong-revision' ? 0 : 1 };
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(session.execute).toHaveBeenCalledTimes(1); expect(changed).toHaveBeenCalledOnce(); runner.dispose();
  });
  it('never schedules exploration or an entirely manual idle battle', async () => {
    const { game, session, runner } = setup();
    game.party.forEach(actor => { actor.autoBattle = false; }); runner.update(false);
    await vi.advanceTimersByTimeAsync(500); expect(session.execute).not.toHaveBeenCalled();
    game.battle = undefined; game.mode = 'auto-play'; runner.update(false);
    await vi.advanceTimersByTimeAsync(500); expect(session.execute).not.toHaveBeenCalled(); runner.dispose();
  });
});
