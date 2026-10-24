import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanonicalSnapshot } from '../persistence/canonical/types';
import { useMazePerception } from './useMazePerception';
import { stageFixture } from '../components/maze3d/stage.test-support';
import type { KnowledgeRegion } from '../persistence/canonical/knowledge/region';
import { checkpointJson } from '../persistence/canonical/game/checkpoint';
import { knowledgeFixture } from '../persistence/canonical/knowledge/region.test-support';
import type { ObservedCell } from '../persistence/canonical/knowledge/types';

const storage = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../persistence/canonical/knowledge/region', () => ({ readCanonicalRegion: storage.read }));
const scope = { floor: 1, row: -7, column: -9, rows: 7, columns: 9 };
const first: CanonicalSnapshot = { generation: 'generation', gameId: 'game', revision: 1,
  roots: { world: 'world', knowledge: 'knowledge', execution: null }, checkpoint: { fixture: 1 } };
const ready = (area = scope) => ({ value: { scope: area, actor: { row: -2, column: -3 }, cells: [] } });
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function linkedSightFrames() {
  const fixture = await stageFixture(), knowledge = knowledgeFixture(), game = fixture.game;
  const publish = async (cells: ObservedCell[]) => {
    game.observation = await knowledge.observe(cells); game.checkpoint = knowledge.checkpoint();
    game.snapshot.checkpoint = checkpointJson(game.checkpoint); game.snapshot.revision++;
    return structuredClone(game);
  };
  const previousGame = await publish(fixture.cells), visible = structuredClone(fixture.cells.slice(1));
  delete visible[0].edges.west;
  return { previousGame, nextGame: await publish(visible) };
}
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

  it('renders published sight on the first frame and directly linked movement without an empty async frame', async () => {
    const { previousGame: initialGame, nextGame: moved } = await linkedSightFrames();
    const area = { floor: 1, row: -3, column: -4, rows: 7, columns: 9 };
    const oldRead = deferred<{ value: KnowledgeRegion }>(), newRead = deferred<{ value: KnowledgeRegion }>();
    storage.read.mockReturnValueOnce(oldRead.promise).mockReturnValueOnce(newRead.promise);
    const frames: Array<KnowledgeRegion | undefined> = [];
    const { result, rerender, unmount } = renderHook(({ game }) => {
      const view = useMazePerception(game.snapshot, area, game); frames.push(view.region); return view;
    }, { initialProps: { game: initialGame } });
    expect(result.current.pending).toBe(true);
    expect(result.current.region?.actor).toEqual({ row: 0, column: 0 });
    expect(result.current.region?.cells.map(entry => entry.state)).toEqual(['visible', 'visible', 'visible']);
    const oldSignal = storage.read.mock.calls[0][2] as AbortSignal;
    rerender({ game: moved });
    expect(result.current.region?.actor).toEqual({ row: 0, column: 1 });
    expect(result.current.region?.cells.map(entry => [entry.cell.world.column, entry.state]))
      .toEqual([[0, 'remembered'], [1, 'visible'], [2, 'visible']]);
    expect(oldSignal.aborted).toBe(true);
    await act(async () => oldRead.resolve({ value: { scope: area, actor: { row: 999, column: 999 }, cells: [] } }));
    expect(result.current.region?.actor).toEqual({ row: 0, column: 1 });
    expect(frames.every(frame => frame && frame.cells.length === 3)).toBe(true);
    const published = result.current.region!;
    await act(async () => newRead.resolve({ value: published }));
    expect(result.current.pending).toBe(false); expect(result.current.region).toEqual(published);
    unmount();
  });

  it.each(['fork', 'generation'] as const)('drops prior displayed memory immediately on a %s change', async change => {
    const { previousGame: game, nextGame: next } = await linkedSightFrames();
    const area = { floor: 1, row: -3, column: -4, rows: 7, columns: 9 };
    storage.read.mockReturnValue(new Promise(() => {}));
    const { result, rerender, unmount } = renderHook(({ game }) => useMazePerception(game.snapshot, area, game), { initialProps: { game } });
    expect(result.current.region?.cells).toHaveLength(3);
    if (change === 'generation') next.snapshot.generation = 'replacement-generation';
    else next.observation!.header.previous = { sequence: game.checkpoint.knowledge!.sequence, id: 'sibling-observation' };
    rerender({ game: next });
    expect(result.current.pending).toBe(true);
    expect(result.current.region?.cells.map(entry => [entry.cell.world.column, entry.state])).toEqual([[1, 'visible'], [2, 'visible']]);
    unmount();
  });

  it('does not read or display sight while disabled and aborts in-flight work when disabled', async () => {
    const { game } = await stageFixture(), area = { floor: 1, row: -3, column: -4, rows: 7, columns: 9 };
    const pending = deferred<{ value: KnowledgeRegion }>(); storage.read.mockReturnValueOnce(pending.promise);
    const { result, rerender, unmount } = renderHook(({ enabled }) => useMazePerception(game.snapshot, area, game, enabled), { initialProps: { enabled: false } });
    expect(storage.read).not.toHaveBeenCalled();
    expect(result.current).toEqual({ region: undefined, pending: false, error: undefined });
    rerender({ enabled: true });
    expect(storage.read).toHaveBeenCalledTimes(1); expect(result.current.region?.cells).toHaveLength(3);
    const signal = storage.read.mock.calls[0][2] as AbortSignal, published = result.current.region!;
    rerender({ enabled: false }); expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve({ value: published }));
    expect(result.current).toEqual({ region: undefined, pending: false, error: undefined });
    expect(storage.read).toHaveBeenCalledTimes(1); unmount();
  });

  it('clears immediate published sight after an asynchronous evidence failure', async () => {
    const { game } = await stageFixture(), area = { floor: 1, row: -3, column: -4, rows: 7, columns: 9 };
    const pending = deferred<{ value: KnowledgeRegion }>(); storage.read.mockReturnValueOnce(pending.promise);
    const { result, unmount } = renderHook(() => useMazePerception(game.snapshot, area, game));
    expect(result.current.region?.cells).toHaveLength(3); expect(result.current.pending).toBe(true);
    await act(async () => pending.reject(new Error('source receipt validation failed')));
    expect(result.current).toEqual({ region: undefined, pending: false, error: 'Map evidence unavailable' });
    unmount();
  });
});
