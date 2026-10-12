import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameSession } from '../../services/game/GameSession';
import type { RpgAgenticaView } from '../../services/agentica/rpg/client';
import { useAgenticPlay } from '../../hooks/useAgenticPlay';

const mocks = vi.hoisted(() => {
  class Client {
    view: RpgAgenticaView = { state: 'idle', connected: false, steps: 0, replans: 0 };
    constructor(readonly options: { onChange: (view: RpgAgenticaView) => void; target: unknown }) { instances.push(this); }
    start = vi.fn(async () => { this.publish({ state: 'running', runId: 'run-one' }); });
    recover = vi.fn(async () => { this.publish({ state: 'paused', runId: 'retained', target: { floor: 2, row: 9, column: 9 } }); });
    adopt = vi.fn(async () => { this.publish({ state: 'running' }); });
    tick = vi.fn(async () => {});
    pause = vi.fn(() => {});
    cancel = vi.fn(async () => {});
    close = vi.fn();
    publish(patch: Partial<RpgAgenticaView>) { this.view = { ...this.view, ...patch }; this.options.onChange(this.view); }
  }
  const instances: Client[] = [];
  return { Client, instances };
});
vi.mock('../../services/agentica/rpg/client', () => ({ RpgAgenticaClient: mocks.Client }));
const target = { floor: 1, row: 0, column: 1 }, url = 'ws://127.0.0.1:5189/api/host';
let session: GameSession;
beforeEach(() => {
  vi.useFakeTimers(); mocks.instances.length = 0;
  session = { view: { controlled: true }, flush: vi.fn(async () => {}) } as unknown as GameSession;
});
afterEach(() => { cleanup(); document.body.replaceChildren(); vi.useRealTimers(); });
const advance = (ms = 150) => act(() => vi.advanceTimersByTimeAsync(ms));
const setup = () => renderHook(({ suspended }) => useAgenticPlay(session, suspended), { initialProps: { suspended: false } });

describe('Agentic play executor ownership', () => {
  it('does not start, recover or adopt on mount or game rerenders, and closes on unmount', async () => {
    const { result, rerender, unmount } = setup();
    await advance(600);
    expect(mocks.instances).toHaveLength(0);
    await act(() => result.current.start(url, target));
    const client = mocks.instances[0];
    rerender({ suspended: false });
    act(() => client.publish({ steps: 2 }));
    expect(result.current.view.steps).toBe(2);
    expect(mocks.instances).toHaveLength(1);
    expect(client.pause).not.toHaveBeenCalled();
    unmount(); await advance();
    expect(client.close).toHaveBeenCalledOnce();
    expect(client.tick).not.toHaveBeenCalled();
  });

  it('runs non-overlapping ticks and immediately pauses without semantic cancellation', async () => {
    const { result } = setup();
    await act(() => result.current.start(url, target));
    const client = mocks.instances[0];
    let release!: () => void;
    client.tick.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    await advance(1500);
    expect(client.tick).toHaveBeenCalledOnce();
    act(() => result.current.pause());
    expect(client.pause).toHaveBeenCalledOnce();
    expect(client.cancel).not.toHaveBeenCalled();
    await act(async () => { release(); });
    await advance(1500);
    expect(client.tick).toHaveBeenCalledOnce();
  });

  it('keeps recovery paused until explicit adoption and displays the recovered target', async () => {
    const { result } = setup();
    await act(() => result.current.reconnect(url, target));
    const client = mocks.instances[0];
    expect(result.current.view.target).toEqual({ floor: 2, row: 9, column: 9 });
    await advance(900);
    expect(client.start).not.toHaveBeenCalled(); expect(client.tick).not.toHaveBeenCalled();
    expect(client.adopt).not.toHaveBeenCalled();
    await act(() => result.current.adopt()); await advance();
    expect(client.adopt).toHaveBeenCalledOnce(); expect(client.tick).toHaveBeenCalledOnce();
  });

  it('does not resume after custody returns or an ordinary dialog closes', async () => {
    const { result, rerender } = setup();
    await act(() => result.current.start(url, target));
    const client = mocks.instances[0];
    rerender({ suspended: true }); rerender({ suspended: false });
    await advance(); expect(client.tick).not.toHaveBeenCalled();
    await act(() => result.current.adopt());
    const dialog = document.createElement('dialog'); dialog.setAttribute('open', ''); document.body.append(dialog);
    await advance(); dialog.remove(); await advance();
    expect(client.tick).not.toHaveBeenCalled();
    await act(() => result.current.adopt());
    session.view.controlled = false; await advance(); session.view.controlled = true; await advance();
    expect(client.tick).not.toHaveBeenCalled();
  });

  it('allows ticks while the Agentic play dialog is open', async () => {
    const dialog = document.createElement('dialog'); dialog.setAttribute('open', '');
    const content = document.createElement('section'); content.setAttribute('data-agentic-play', '');
    dialog.append(content); document.body.append(dialog);
    const { result } = setup();
    await act(() => result.current.start(url, target)); await advance(450);
    expect(mocks.instances[0].tick).toHaveBeenCalledTimes(3);
  });

  it('lets Stop interrupt pending adoption and fences its late completion', async () => {
    const { result } = setup();
    await act(() => result.current.reconnect(url, target));
    const client = mocks.instances[0];
    let release!: () => void;
    client.adopt.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    let adoption!: Promise<void>;
    act(() => { adoption = result.current.adopt(); });
    await act(async () => {});
    expect(result.current.busy).toBe(true); expect(result.current.canStop).toBe(true);
    await act(() => result.current.stop());
    expect(client.cancel).toHaveBeenCalledOnce();
    await act(async () => { release(); await adoption; }); await advance(900);
    expect(client.tick).not.toHaveBeenCalled();
  });

  it('surfaces errors and stops ticking without hidden retries', async () => {
    const { result } = setup();
    await act(() => result.current.start(url, target));
    const client = mocks.instances[0];
    client.tick.mockRejectedValueOnce(new Error('Host unavailable'));
    await advance(900);
    expect(result.current.error).toBe('Host unavailable');
    expect(client.tick).toHaveBeenCalledOnce(); expect(client.cancel).not.toHaveBeenCalled();
  });

  it('does not dispatch a delayed Start after manual input while the game queue drains', async () => {
    const { result } = setup();
    let release!: () => void;
    vi.mocked(session.flush).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    let starting!: Promise<void>;
    act(() => { starting = result.current.start(url, target); });
    const client = mocks.instances[0];
    act(() => result.current.pause());
    await act(async () => { release(); await starting; }); await advance(900);
    expect(client.start).not.toHaveBeenCalled(); expect(client.tick).not.toHaveBeenCalled();
  });

  it('never overlaps an old tick with a newly adopted loop', async () => {
    const { result } = setup();
    await act(() => result.current.start(url, target));
    const client = mocks.instances[0];
    let release!: () => void;
    client.tick.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    await advance();
    act(() => result.current.pause());
    await act(() => result.current.adopt()); await advance(900);
    expect(client.tick).toHaveBeenCalledOnce();
    await act(async () => { release(); }); await advance();
    expect(client.tick).toHaveBeenCalledTimes(2);
  });

  it('ignores callbacks from a replaced client', async () => {
    const { result } = setup();
    await act(() => result.current.start(url, target));
    const previous = mocks.instances[0];
    await act(() => result.current.reconnect(url, target));
    act(() => previous.publish({ state: 'running', steps: 999 }));
    expect(previous.close).toHaveBeenCalledOnce();
    expect(result.current.view.state).toBe('paused'); expect(result.current.view.steps).toBe(0);
  });
});
