import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CanonicalSnapshot } from '../persistence/canonical/types';
import type { KnownNode, KnownPage } from '../persistence/canonical/knowledge/graph';
import { useKnownRooms } from './useKnownRooms';

const storage = vi.hoisted(() => ({ page: vi.fn(), anchor: vi.fn() }));
vi.mock('../persistence/canonical/knowledge/roomMap', () => ({ readCanonicalRooms: storage.page, readCanonicalRoomAnchor: storage.anchor }));
const snapshot: CanonicalSnapshot = { generation: 'generation', gameId: 'game', revision: 1,
  roots: { knowledge: 'knowledge', world: 'world', execution: null }, checkpoint: { fixture: 1 } };
const node: KnownNode = { level: 1, spaceId: 'earned', kind: 'room', anchor: {
  at: { level: 1, cell: { spaceId: 'earned', row: 0, column: 0 } }, world: { row: -8, column: 20 },
  source: { sequence: 1, id: 'sight', index: 0 },
} };
const page: KnownPage<KnownNode> = { anchor: { sequence: 1, id: 'sight', witness: 'witness' }, items: [node], next: 'opaque-next' };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => { vi.resetAllMocks(); storage.page.mockResolvedValue({ value: page }); storage.anchor.mockResolvedValue({ value: node.anchor }); });
afterEach(cleanup);

it('does no ambient read, reads once when enabled, and retains only the requested page', async () => {
  const { result, rerender } = renderHook(({ enabled }) => useKnownRooms(structuredClone(snapshot), enabled), { initialProps: { enabled: false } });
  expect(storage.page).not.toHaveBeenCalled(); expect(result.current.page).toBeUndefined();
  rerender({ enabled: true }); await waitFor(() => expect(result.current.page).toEqual(page));
  for (let i = 0; i < 5; i++) rerender({ enabled: true });
  expect(storage.page).toHaveBeenCalledTimes(1);
  const pending = deferred<{ value: KnownPage<KnownNode> }>(); storage.page.mockReturnValueOnce(pending.promise);
  act(() => result.current.next()); expect(result.current.page).toBeUndefined(); expect(result.current.busy).toBe(true);
  expect(storage.page.mock.calls[1].slice(0, 2)).toEqual([snapshot, page.next]);
  await act(async () => pending.resolve({ value: { ...page, items: [], next: undefined } }));
  expect(result.current.number).toBe(2); expect(result.current.page?.items).toEqual([]);
  act(() => result.current.next()); expect(storage.page).toHaveBeenCalledTimes(2);
  act(() => result.current.first()); await waitFor(() => expect(result.current.page).toEqual(page));
  expect(result.current.number).toBe(1); expect(storage.page.mock.calls[2][1]).toBeUndefined();
});

it.each(['revision', 'knowledge', 'generation', 'gameId', 'checkpoint'] as const)('hides old pages and cancels selection on %s change', async field => {
  const { result, rerender } = renderHook(({ root }) => useKnownRooms(root, true), { initialProps: { root: snapshot } });
  await waitFor(() => expect(result.current.page).toBeDefined());
  act(() => result.current.next()); await waitFor(() => expect(result.current.page).toBeDefined());
  const selected = vi.fn(), pending = deferred<{ value: typeof node.anchor }>(); storage.anchor.mockReturnValueOnce(pending.promise);
  let selecting: Promise<void>;
  act(() => { selecting = result.current.select(node.spaceId, selected); });
  const signal = storage.anchor.mock.calls[0][2] as AbortSignal, next = structuredClone(snapshot);
  if (field === 'revision') next.revision++;
  else if (field === 'knowledge') next.roots.knowledge = 'replacement';
  else if (field === 'checkpoint') next.checkpoint = { fixture: 2 };
  else next[field] = 'replacement';
  const newPage = deferred<{ value: KnownPage<KnownNode> }>(); storage.page.mockReturnValueOnce(newPage.promise);
  rerender({ root: next }); expect(result.current.page).toBeUndefined(); expect(result.current.number).toBe(1);
  expect(signal.aborted).toBe(true); expect(storage.page.mock.calls.at(-1)?.slice(0, 2)).toEqual([next, undefined]);
  await act(async () => { pending.resolve({ value: node.anchor }); await selecting; });
  expect(selected).not.toHaveBeenCalled(); expect(result.current.page).toBeUndefined();
  await act(async () => newPage.resolve({ value: { ...page, items: [] } }));
  expect(result.current.page?.items).toEqual([]);
});

it('ignores late page completion after root replacement and aborts on unmount', async () => {
  const pending = deferred<{ value: KnownPage<KnownNode> }>(); storage.page.mockReturnValueOnce(pending.promise);
  const { result, rerender, unmount } = renderHook(({ root }) => useKnownRooms(root, true), { initialProps: { root: snapshot } });
  const oldSignal = storage.page.mock.calls[0][2] as AbortSignal;
  storage.page.mockResolvedValueOnce({ value: { ...page, items: [] } });
  rerender({ root: { ...snapshot, revision: 2 } }); await waitFor(() => expect(result.current.page?.items).toEqual([]));
  await act(async () => pending.resolve({ value: page })); expect(result.current.page?.items).toEqual([]); expect(oldSignal.aborted).toBe(true);
  const signal = storage.page.mock.calls[1][2] as AbortSignal; unmount(); expect(signal.aborted).toBe(true);
});

it('requires displayed room membership, serializes selection, and returns only the revalidated anchor', async () => {
  const { result } = renderHook(() => useKnownRooms(snapshot, true)); await waitFor(() => expect(result.current.page).toBeDefined());
  const selected = vi.fn(); await act(async () => result.current.select('hidden', selected)); expect(storage.anchor).not.toHaveBeenCalled();
  const pending = deferred<{ value: typeof node.anchor }>(); storage.anchor.mockReturnValueOnce(pending.promise);
  let selecting: Promise<void>;
  act(() => { selecting = result.current.select('earned', selected); void result.current.select('earned', selected); });
  expect(result.current.busy).toBe(true); expect(storage.anchor).toHaveBeenCalledTimes(1);
  act(() => { result.current.next(); result.current.first(); }); expect(storage.page).toHaveBeenCalledTimes(1);
  await act(async () => { pending.resolve({ value: node.anchor }); await selecting; });
  expect(selected).toHaveBeenCalledExactlyOnceWith(node.anchor);
  expect(storage.anchor.mock.calls[0].slice(0, 2)).toEqual([snapshot, node]);
});

it('takeover disables and aborts pending recall without invoking its callback', async () => {
  const { result, rerender } = renderHook(({ enabled }) => useKnownRooms(snapshot, enabled), { initialProps: { enabled: true } });
  await waitFor(() => expect(result.current.page).toBeDefined());
  const pending = deferred<{ value: typeof node.anchor }>(), selected = vi.fn(); storage.anchor.mockReturnValueOnce(pending.promise);
  let selecting: Promise<void>; act(() => { selecting = result.current.select('earned', selected); });
  const signal = storage.anchor.mock.calls[0][2] as AbortSignal;
  rerender({ enabled: false }); expect(result.current.page).toBeUndefined(); expect(signal.aborted).toBe(true);
  await act(async () => { pending.resolve({ value: node.anchor }); await selecting; });
  expect(selected).not.toHaveBeenCalled();
  act(() => { result.current.next(); result.current.first(); }); expect(storage.page).toHaveBeenCalledTimes(1);
});

it('aborts recall when its map tab unmounts, ignoring even an abort-insensitive late result', async () => {
  const { result, unmount } = renderHook(() => useKnownRooms(snapshot, true));
  await waitFor(() => expect(result.current.page).toBeDefined());
  const pending = deferred<{ value: typeof node.anchor }>(), selected = vi.fn(); storage.anchor.mockReturnValueOnce(pending.promise);
  let selecting: Promise<void>; act(() => { selecting = result.current.select('earned', selected); });
  const signal = storage.anchor.mock.calls[0][2] as AbortSignal;
  unmount(); expect(signal.aborted).toBe(true);
  await act(async () => { pending.resolve({ value: node.anchor }); await selecting; });
  expect(selected).not.toHaveBeenCalled();
});

it('fails closed on page or anchor errors and retries from the first page without fallback', async () => {
  storage.page.mockRejectedValueOnce(Error('budget exhausted'));
  const { result } = renderHook(() => useKnownRooms(snapshot, true));
  await waitFor(() => expect(result.current.error).toBe('Room evidence unavailable'));
  expect(result.current.page).toBeUndefined(); act(() => result.current.first());
  await waitFor(() => expect(result.current.page).toBeDefined());
  storage.anchor.mockRejectedValueOnce(Error('witness changed')); const selected = vi.fn();
  await act(async () => result.current.select('earned', selected));
  expect(result.current.error).toBe('Room anchor unavailable'); expect(result.current.page).toBeUndefined(); expect(selected).not.toHaveBeenCalled();
  act(() => result.current.first()); await waitFor(() => expect(result.current.page).toBeDefined());
  expect(storage.page.mock.calls.every(call => call[1] === undefined)).toBe(true);
});
