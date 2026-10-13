import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanonicalSnapshot } from '../persistence/canonical/types';
import { useMazePerception } from './useMazePerception';

const storage = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../persistence/canonical/knowledge/region', () => ({ readCanonicalRegion: storage.read }));
const scope = { floor: 1, row: -7, column: -9, rows: 7, columns: 9 };
const first: CanonicalSnapshot = { generation: 'generation', gameId: 'game', revision: 1,
  roots: { world: 'world', knowledge: 'knowledge', execution: null }, checkpoint: { fixture: 1 } };
const ready = (area = scope) => ({ value: { scope: area, actor: { row: -2, column: -3 }, cells: [] } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => { vi.resetAllMocks(); storage.read.mockResolvedValue(ready()); });

describe('canonical snapshot-fenced canvas perception', () => {
  it('queries once per snapshot/scope and does not read during repeated renders', async () => {
    const { result, rerender, unmount } = renderHook(() => useMazePerception(structuredClone(first), { ...scope }));
    await waitFor(() => expect(result.current.pending).toBe(false));
    for (let i = 0; i < 20; i++) rerender();
    expect(storage.read).toHaveBeenCalledTimes(1);
    expect(storage.read.mock.calls[0].slice(0, 2)).toEqual([first, scope]);
    expect(result.current.region).toEqual(ready().value); unmount();
  });

  it.each(['revision', 'knowledge', 'generation', 'checkpoint'] as const)('immediately hides old cells on %s change and ignores late completions', async field => {
    const pending = deferred<ReturnType<typeof ready>>(); storage.read.mockReturnValueOnce(pending.promise);
    const { result, rerender, unmount } = renderHook(({ snapshot }) => useMazePerception(snapshot, scope), { initialProps: { snapshot: first } });
    const signal = storage.read.mock.calls[0][2] as AbortSignal, next = structuredClone(first);
    if (field === 'revision') next.revision++;
    else if (field === 'knowledge') next.roots.knowledge = 'replacement';
    else if (field === 'generation') next.generation = 'new-generation';
    else next.checkpoint = { fixture: 2 };
    rerender({ snapshot: next }); expect(result.current.region).toBeUndefined();
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve({ value: { ...ready().value, actor: { row: 999, column: 999 } } }));
    expect(result.current.region?.actor).toEqual(ready().value.actor); unmount();
  });

  it('aborts stale scope reads, never retaining offscreen cells while panning', async () => {
    const { result, rerender, unmount } = renderHook(({ area }) => useMazePerception(first, area), { initialProps: { area: scope } });
    await waitFor(() => expect(result.current.region).toBeDefined());
    const pending = deferred<ReturnType<typeof ready>>(); storage.read.mockReturnValueOnce(pending.promise);
    rerender({ area: { ...scope, row: -70 } }); expect(result.current.region).toBeUndefined();
    const signal = storage.read.mock.calls[1][2] as AbortSignal;
    unmount(); expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(ready())); expect(storage.read).toHaveBeenCalledTimes(2);
  });

  it('fails closed on budget/evidence errors without a legacy full-save fallback', async () => {
    storage.read.mockRejectedValueOnce(new Error('read budget exhausted'));
    const { result, unmount } = renderHook(() => useMazePerception(first, scope));
    await waitFor(() => expect(result.current.error).toBe('Map evidence unavailable'));
    expect(result.current.region).toBeUndefined(); expect(result.current.pending).toBe(false); unmount();
  });
});
