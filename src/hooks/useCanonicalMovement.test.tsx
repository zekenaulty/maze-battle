import { act, cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameCheckpoint } from '../persistence/canonical/game/checkpoint';
import { readKnowledgeRegion } from '../persistence/canonical/knowledge/region';
import { findKnownRoute, navigationScope, readNavigationRoute, type KnownRoute } from '../persistence/canonical/knowledge/navigation';
import type { CanonicalReceipt } from '../persistence/canonical/types';
import { controllerFixture, deferred } from './canonicalHooks.test-support';
import { CANONICAL_CLICK_STEP_MS, useCanonicalMovement } from './useCanonicalMovement';

vi.mock('../persistence/canonical/knowledge/navigation', async actual => ({
  ...await actual<typeof import('../persistence/canonical/knowledge/navigation')>(), readNavigationRoute: vi.fn(),
}));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); document.querySelectorAll('dialog, input').forEach(element => element.remove()); });
const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(CANONICAL_CLICK_STEP_MS); });
async function setup() {
  const fixture = await controllerFixture(), { controller, knowledge } = fixture;
  vi.mocked(readNavigationRoute).mockImplementation(async (snapshot, start, target, signal) => {
    signal?.throwIfAborted();
    const checkpoint = gameCheckpoint(snapshot.checkpoint), scope = navigationScope(checkpoint.position.level, start, target);
    return scope ? findKnownRoute(await readKnowledgeRegion(knowledge.pages, checkpoint, scope), checkpoint.position, target) : null;
  });
  vi.useFakeTimers();
  const hook = renderHook(({ blocked }) => useCanonicalMovement(controller.view.game, blocked, controller), { initialProps: { blocked: false } });
  return { ...fixture, ...hook };
}

describe('canonical movement input', () => {
  it('walks the earned route one awaited step per tick, without stairs, loot or extra dispatches', async () => {
    const { controller, cells, result } = await setup();
    await act(() => result.current.navigate(cells[3].world));
    expect(controller.execute).not.toHaveBeenCalled();
    await tick(); await tick(); await tick(); await tick();
    expect(controller.execute).toHaveBeenCalledTimes(3);
    for (const call of controller.execute.mock.calls) expect(call).toEqual(['exploration', { kind: 'move', direction: 'east', triggerStairs: false }]);
    expect(controller.view.game.checkpoint.position).toEqual(cells[3].at);
    expect(result.current.message).toBe('Arrived');
    expect(readNavigationRoute).toHaveBeenCalledTimes(1);
  });

  it('waits for Auto shutdown before reading a click route and survives that mode publication', async () => {
    const { controller, cells, publish, receipt, result, rerender } = await setup(), stop = deferred<CanonicalReceipt>();
    act(() => { publish(0, 'auto-play'); rerender({ blocked: false }); });
    controller.execute.mockImplementationOnce(() => stop.promise);
    let navigating!: Promise<void>;
    const target = { ...cells[2].world };
    act(() => { navigating = result.current.navigate(target); });
    target.column += 100;
    expect(controller.execute).toHaveBeenCalledExactlyOnceWith('settings', { kind: 'auto', enabled: false });
    expect(readNavigationRoute).not.toHaveBeenCalled();
    await act(async () => { publish(0, 'manual'); rerender({ blocked: false }); stop.resolve(receipt()); await navigating; });
    expect(result.current.message).toBe('Walking');
    expect(readNavigationRoute).toHaveBeenCalledWith(expect.anything(), cells[0].world, cells[2].world, expect.any(AbortSignal));
    await tick();
    expect(controller.execute).toHaveBeenLastCalledWith('exploration', { kind: 'move', direction: 'east', triggerStairs: false });
  });

  it('keyboard movement cancels the click route and deliberately permits stairs', async () => {
    const { controller, cells, result } = await setup();
    await act(() => result.current.navigate(cells[3].world)); await tick();
    await act(async () => { fireEvent.keyDown(window, { key: 'a' }); });
    await tick(); await tick();
    expect(controller.execute).toHaveBeenCalledTimes(2);
    expect(controller.execute).toHaveBeenLastCalledWith('exploration', { kind: 'move', direction: 'west', triggerStairs: true });
    expect(controller.view.game.checkpoint.position).toEqual(cells[0].at);
  });

  it.each([false, true])('keyboard awaits Auto shutdown; cancellation during the wait: %s', async cancelled => {
    const { controller, publish, receipt, result } = await setup(), stop = deferred<CanonicalReceipt>();
    publish(0, 'auto-play'); controller.execute.mockImplementationOnce(() => stop.promise);
    await act(async () => { fireEvent.keyDown(window, { key: 'ArrowRight' }); });
    expect(controller.execute).toHaveBeenCalledExactlyOnceWith('settings', { kind: 'auto', enabled: false });
    await act(async () => { if (cancelled) result.current.cancel(); publish(0, 'manual'); stop.resolve(receipt()); });
    await tick();
    expect(controller.execute).toHaveBeenCalledTimes(cancelled ? 1 : 2);
    if (!cancelled) expect(controller.execute).toHaveBeenLastCalledWith('exploration', { kind: 'move', direction: 'east', triggerStairs: true });
  });

  it('neither queues click steps nor resumes after a manual key during an in-flight move', async () => {
    const { controller, cells, publish, receipt, result } = await setup(), moving = deferred<CanonicalReceipt>();
    await act(() => result.current.navigate(cells[3].world));
    controller.execute.mockImplementationOnce(() => moving.promise);
    await tick(); await tick(); await tick();
    expect(controller.execute).toHaveBeenCalledTimes(1);
    controller.view.busy = true;
    await act(async () => { fireEvent.keyDown(window, { key: 'ArrowLeft' }); });
    await act(async () => { controller.view.busy = false; publish(1); moving.resolve(receipt()); });
    await tick(); await tick();
    expect(controller.execute).toHaveBeenCalledTimes(1);
  });

  it.each(['cancel', 'blocked', 'town', 'auto', 'floor', 'id', 'generation', 'custody', 'recovery', 'busy', 'owner', 'revision', 'position', 'dialog'])
    ('cancels permanently on %s', async cause => {
      const { controller, cells, result, rerender, publish } = await setup();
      await act(() => result.current.navigate(cells[3].world));
      await act(async () => {
        if (cause === 'cancel') result.current.cancel();
        if (cause === 'town' || cause === 'auto') publish(0, cause === 'town' ? 'town' : 'auto-play');
        if (cause === 'floor') controller.view.game.checkpoint.position.level++;
        if (cause === 'id') controller.view.game.id = 'different';
        if (cause === 'generation') controller.view.game.snapshot.generation = 'different';
        if (cause === 'custody') controller.view.controlled = false;
        if (cause === 'recovery') controller.view.recoveryRequired = true;
        if (cause === 'busy') controller.view.busy = true;
        if (cause === 'owner') controller.owner = 'different';
        if (cause === 'revision') controller.view.game.snapshot.revision++;
        if (cause === 'position') controller.view.game.checkpoint.position = cells[1].at;
        if (cause === 'dialog') { const dialog = document.createElement('dialog'); dialog.open = true; document.body.append(dialog); }
        rerender({ blocked: cause === 'blocked' });
      });
      await tick(); await tick();
      await act(async () => { controller.view.controlled = true; document.querySelector('dialog')?.remove(); rerender({ blocked: false }); });
      await tick();
      expect(controller.execute).not.toHaveBeenCalled();
    });

  it.each(['cancel', 'blocked', 'floor', 'id', 'custody', 'dialog', 'revision', 'unmount'])('discards a pending route after %s', async cause => {
    const { controller, cells, result, rerender, unmount } = await setup(), route = deferred<KnownRoute | null>();
    vi.mocked(readNavigationRoute).mockReturnValueOnce(route.promise);
    let navigating!: Promise<void>;
    await act(async () => { navigating = result.current.navigate(cells[3].world); });
    const signal = vi.mocked(readNavigationRoute).mock.calls[0][3]!;
    await act(async () => {
      if (cause === 'cancel') result.current.cancel();
      if (cause === 'floor') controller.view.game.checkpoint.position.level++;
      if (cause === 'id') controller.view.game.id = 'different';
      if (cause === 'custody') controller.view.controlled = false;
      if (cause === 'dialog') { const dialog = document.createElement('dialog'); dialog.open = true; document.body.append(dialog); }
      if (cause === 'revision') controller.view.game.snapshot.revision++;
      if (cause === 'unmount') unmount(); else rerender({ blocked: cause === 'blocked' });
    });
    if (cause !== 'revision') expect(signal.aborted).toBe(true);
    await act(async () => { route.resolve({ complete: true, steps: [{ from: cells[0].at, to: cells[1].at, direction: 'east' }] }); await navigating; });
    await tick();
    expect(controller.execute).not.toHaveBeenCalled();
    if (cause !== 'unmount') expect(result.current.message).toBe('');
  });

  it('stops at the route window without silently requesting another one', async () => {
    const { controller, cells, result } = await setup();
    vi.mocked(readNavigationRoute).mockResolvedValueOnce({ complete: false,
      steps: [{ from: cells[0].at, to: cells[1].at, direction: 'east' }] });
    await act(() => result.current.navigate(cells[4].world)); await tick(); await tick();
    expect(controller.execute).toHaveBeenCalledTimes(1);
    expect(readNavigationRoute).toHaveBeenCalledTimes(1);
    expect(result.current.message).toContain('Route window complete');
  });

  it('keeps unknown clicks inert and ignores editable fields and modified keys', async () => {
    const { controller, result } = await setup();
    await act(() => result.current.navigate({ row: -5, column: 10 }));
    expect(result.current.message).toContain('No route');
    const input = document.createElement('input'); document.body.append(input);
    await act(async () => { fireEvent.keyDown(input, { key: 'd' }); fireEvent.keyDown(window, { key: 'd', ctrlKey: true }); });
    await tick();
    expect(controller.execute).not.toHaveBeenCalled();
  });

  it('stops at a rejected move or a blocked destination without retrying', async () => {
    const { controller, cells, result, receipt } = await setup();
    await act(() => result.current.navigate(cells[3].world));
    controller.execute.mockResolvedValueOnce(receipt(1));
    await tick(); await tick();
    expect(controller.execute).toHaveBeenCalledTimes(1);
    await act(() => result.current.navigate(cells[3].world));
    controller.execute.mockRejectedValueOnce(Error('Read only'));
    await tick(); await tick();
    expect(controller.execute).toHaveBeenCalledTimes(2);
    expect(result.current.message).toBe('Read only');
  });
});
