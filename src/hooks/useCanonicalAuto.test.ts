import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useCanonicalAuto } from './useCanonicalAuto';
import { controllerFixture } from './canonicalHooks.test-support';
import type { CanonicalAutoSession } from '../services/game/CanonicalAutoController';

afterEach(() => { document.querySelectorAll('dialog').forEach(d => d.remove()); vi.useRealTimers(); });
async function setup() {
  const f = await controllerFixture(); f.publish(0, 'auto-play');
  const game = { ...f.controller.view.game, autoThrottleMs: 100 };
  const session = { owner: 'owner', view: { game, controlled: true }, execute: vi.fn<CanonicalAutoSession['execute']>() };
  session.execute.mockImplementation(async () => {
    game.snapshot.revision++;
    return { ...f.receipt(), beforeRevision: game.snapshot.revision - 1, afterRevision: game.snapshot.revision, result: { outcome: 'applied' } };
  });
  vi.useFakeTimers(); return { game, session };
}
it('never starts behind an already-open dialog and disposes its timer on unmount', async () => {
  const { game, session } = await setup(), dialog = document.createElement('dialog'); dialog.open = true; document.body.append(dialog);
  const hook = renderHook(() => useCanonicalAuto(game, false, session));
  await act(() => vi.advanceTimersByTimeAsync(500)); expect(session.execute).not.toHaveBeenCalled();
  await act(async () => { dialog.open = false; }); hook.rerender();
  await act(() => vi.advanceTimersByTimeAsync(500)); expect(session.execute).not.toHaveBeenCalled();
  hook.unmount(); await act(() => vi.advanceTimersByTimeAsync(500)); expect(session.execute).not.toHaveBeenCalled();
});
it('cancels when a dialog opens and does not restart just because the dialog closes', async () => {
  const { game, session } = await setup(), dialog = document.createElement('dialog'); document.body.append(dialog);
  const hook = renderHook(() => useCanonicalAuto(game, false, session));
  await act(() => vi.advanceTimersByTimeAsync(100)); expect(session.execute).toHaveBeenCalledTimes(1);
  await act(async () => { dialog.open = true; }); await act(() => vi.advanceTimersByTimeAsync(500));
  await act(async () => { dialog.open = false; }); hook.rerender(); await act(() => vi.advanceTimersByTimeAsync(500));
  expect(session.execute).toHaveBeenCalledTimes(1); hook.unmount();
});
