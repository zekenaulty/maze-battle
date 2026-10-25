import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { BattleScheduleView, CanonicalBattleSession } from '../services/game/CanonicalBattleController';
import { useCanonicalBattle } from './useCanonicalBattle';

afterEach(() => { cleanup(); vi.useRealTimers(); document.querySelectorAll('dialog').forEach(dialog => dialog.remove()); });
function session() {
  const game: BattleScheduleView = { id: 'game', snapshot: { generation: 'generation', revision: 1 }, mode: 'battle',
    checkpoint: { position: { level: 1 } }, party: [{ autoBattle: true }], autoThrottleMs: 100,
    battle: { id: 'battle', status: 'active' } };
  return { owner: 'owner', view: { game, controlled: true }, execute: vi.fn<CanonicalBattleSession['execute']>(async () => {
    const beforeRevision = game.snapshot.revision++;
    return { gameId: game.id, generation: game.snapshot.generation, attemptId: 'attempt', fingerprint: 'test',
      committedAt: new Date().toISOString(), beforeRevision, afterRevision: game.snapshot.revision, result: { outcome: 'applied' } };
  }) };
}

it('pauses for a child-owned dialog and resumes only the existing allowed policy on close', async () => {
  vi.useFakeTimers(); const s = session(); renderHook(() => useCanonicalBattle(s, false));
  const dialog = document.createElement('dialog');
  await act(async () => { dialog.open = true; document.body.append(dialog); });
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(s.execute).not.toHaveBeenCalled();
  await act(async () => { dialog.open = false; });
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  expect(s.execute).toHaveBeenCalledOnce();
});

it('clears all scheduling on unmount without mutating game state', async () => {
  vi.useFakeTimers(); const s = session(), before = structuredClone(s.view.game);
  const { unmount } = renderHook(() => useCanonicalBattle(s, false));
  unmount(); await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(s.execute).not.toHaveBeenCalled(); expect(s.view.game).toEqual(before);
  expect(vi.getTimerCount()).toBe(0);
});
