import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sight } from '../persistence/rpgMemory/perception.test-support';
import { currentPerception } from '../viewModels/currentPerception';
import { useMazePerception } from './useMazePerception';

const storage = vi.hoisted(() => ({ history: vi.fn(), prepare: vi.fn(), region: vi.fn() }));
vi.mock('../persistence/observationArchive', () => ({ readRpgHistory: storage.history }));
vi.mock('../persistence/rpgMemory/prepare', () => ({ prepareRpgMemory: storage.prepare }));
vi.mock('../persistence/rpgMemory/perception', () => ({ readRpgPerceptionRegion: storage.region }));
const scope = { floor: 1, row: 0, column: 0, rows: 7, columns: 9 };
const first = sight([0, 1, 2], 1), second = sight([2, 3, 4], 2);
const history = (observation = first, ancestors: string[] = []) => ({ records: [{ observation, ancestors }] });
const ready = (observation = first, area = scope) => ({ status: 'ready', snapshotId: observation.id,
  data: currentPerception(observation, area) });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  storage.history.mockResolvedValue(history());
  storage.prepare.mockResolvedValue({ status: 'ready' });
  storage.region.mockResolvedValue(ready());
});

describe('source-fenced canvas perception', () => {
  it('queries once per source/scope, not on repeated renders or animation ticks', async () => {
    const { result, rerender, unmount } = renderHook(() => useMazePerception(first.gameId, first.id, { ...scope }));
    await waitFor(() => expect(result.current.pending).toBe(false));
    for (let i = 0; i < 20; i++) rerender();
    expect(storage.history).toHaveBeenCalledTimes(1);
    expect(storage.prepare).toHaveBeenCalledTimes(1);
    expect(storage.region).toHaveBeenCalledTimes(1);
    expect(storage.region.mock.calls[0].slice(0, 3)).toEqual(['auto', scope, first.id]);
    expect(result.current.region?.snapshotId).toBe(first.id);
    unmount();
  });

  it('renders direct sight while preparation is pending, then aborts the old source on replacement', async () => {
    const pending = deferred<{ status: string }>();
    storage.prepare.mockReturnValueOnce(pending.promise);
    const { result, rerender, unmount } = renderHook(({ id }) => useMazePerception(first.gameId, id, scope),
      { initialProps: { id: first.id } });
    await waitFor(() => expect(result.current.region?.snapshotId).toBe(first.id));
    expect(result.current.pending).toBe(true);
    const signal = storage.prepare.mock.calls[0][1].signal as AbortSignal;
    storage.history.mockResolvedValue(history(second)); storage.region.mockResolvedValue(ready(second));
    rerender({ id: second.id });
    expect(result.current.region).toBeUndefined();
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve({ status: 'ready' }));
    expect(result.current.region?.snapshotId).toBe(second.id);
    expect(storage.region).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('ignores a late region response after a camera scope change and never refreshes source history for panning', async () => {
    const pending = deferred<ReturnType<typeof ready>>();
    storage.region.mockReturnValueOnce(pending.promise);
    const { result, rerender, unmount } = renderHook(({ area }) => useMazePerception(first.gameId, first.id, area),
      { initialProps: { area: scope } });
    await waitFor(() => expect(storage.region).toHaveBeenCalledTimes(1));
    const signal = storage.region.mock.calls[0][3].signal as AbortSignal;
    const area = { ...scope, column: 1 };
    storage.region.mockResolvedValue(ready(first, area));
    rerender({ area });
    await waitFor(() => expect(result.current.pending).toBe(false));
    await act(async () => pending.resolve(ready()));
    expect(result.current.region?.scope).toEqual(area);
    expect(signal.aborted).toBe(true);
    expect(storage.history).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('rejects foreign source history and clears pixels when the head is absent', async () => {
    const { result, rerender, unmount } = renderHook(({ game, id }: { game: string; id?: string }) => useMazePerception(game, id, scope),
      { initialProps: { game: first.gameId, id: first.id as string | undefined } });
    await waitFor(() => expect(result.current.pending).toBe(false));
    rerender({ game: 'other-game', id: first.id });
    expect(result.current.region).toBeUndefined();
    await waitFor(() => expect(result.current.error).toBe('Map evidence unavailable'));
    expect(storage.region).toHaveBeenCalledTimes(1);
    rerender({ game: first.gameId, id: undefined });
    expect(result.current.region).toBeUndefined();
    expect(result.current.error).toBeUndefined();
    unmount();
  });

  it('retains only direct witnessed sight when an index query fails', async () => {
    storage.region.mockResolvedValue({ status: 'exhausted' });
    const { result, unmount } = renderHook(() => useMazePerception(first.gameId, first.id, scope));
    await waitFor(() => expect(result.current.error).toBe('Map evidence unavailable'));
    expect(result.current.region).toEqual(currentPerception(first, scope));
    expect(result.current.region?.cells.every(c => c.state === 'visible')).toBe(true);
    expect(storage.region).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('prepares one source at a time and stops partial work on unmount', async () => {
    storage.prepare.mockResolvedValue({ status: 'partial' });
    const { result, unmount } = renderHook(() => useMazePerception(first.gameId, first.id, scope));
    await waitFor(() => expect(result.current.region).toBeDefined());
    const calls = storage.prepare.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every(([, options]) => options.maxSources === 1)).toBe(true);
    const signal = calls[0][1].signal as AbortSignal;
    unmount(); const count = calls.length;
    await new Promise(resolve => setTimeout(resolve, 80));
    expect(storage.prepare).toHaveBeenCalledTimes(count);
    expect(signal.aborted).toBe(true);
    expect(storage.region).not.toHaveBeenCalled();
  });
});
