import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { exploreView } from './components/ExploreScreen.test-support';
import type { RecoveryInspection, RecoveryInventory } from './components/agentic/useAgenticaRecovery';
import type { useGameSession } from './hooks/useGameSession';
import type { GameSession } from './services/game/GameSession';

const mocks = vi.hoisted(() => ({ session: {} as ReturnType<typeof useGameSession>, list: vi.fn(), inspect: vi.fn(),
  readLaunch: vi.fn(), database: vi.fn(), initial: vi.fn(), granted: vi.fn(), cancel: vi.fn() }));
vi.mock('./hooks/useGameSession', () => ({ useGameSession: () => mocks.session }));
vi.mock('./hooks/useCanonicalMovement', () => ({ useCanonicalMovement: () => ({ cancel: mocks.cancel }) }));
vi.mock('./hooks/useCanonicalAuto', () => ({ useCanonicalAuto: () => ({ cancel: mocks.cancel }) }));
vi.mock('./hooks/useGameCommands', () => ({ useGameCommands: () => ({}) }));
vi.mock('./components/ExploreScreen', () => ({ ExploreScreen: ({ onAgenticPlay }: { onAgenticPlay: () => void }) =>
  <button onClick={onAgenticPlay}>Agentic play</button> }));
vi.mock('./persistence/canonical/agentica/recovery', () => ({ listAgenticaRecovery: mocks.list, inspectAgenticaRecovery: mocks.inspect }));
vi.mock('./persistence/canonical/agentica/launch', () => ({ readLaunch: mocks.readLaunch }));
vi.mock('./persistence/canonical/agentica/recovery.database', () => ({ inRecoveryDatabase: mocks.database }));
vi.mock('./services/agentica/game/launchRecovery', () => ({ createLaunchRecovery: mocks.initial, createGrantedLaunchRecovery: mocks.granted }));

const candidate = { operationId: 'travel-original', original: { key: 'original-key', id: 'original-id' },
  binding: { grant: { key: 'grant-key', id: 'grant-id' }, publication: { key: 'publication-key', id: 'publication-id' } } };
const inventory = (): RecoveryInventory => ({ fence: { generation: 'generation', gameId: 'canonical-game', owner: 'owner', epoch: 1, revision: 5 },
  active: { launchId: 'root-launch', guardId: 'root-guard', state: 'admitted', grant: null }, selected: null,
  allocations: [{ operationId: candidate.operationId, state: 'admitted', navigation: candidate }],
  pendingRemoteActions: 'unknown', sessionClear: 'unknown', stats: { reads: 3, writes: 0, readBytes: 100, writeBytes: 0 } });
const detail = { action: { actionId: 'original-action', capabilityId: 'maze.navigate' }, operation: { state: 'admitted' },
  progress: { status: 'running', steps: 2 }, terminal: null, acknowledgement: null, decision: null, claim: null } as unknown as RecoveryInspection;
let lifetime: AbortController, schema: AbortController;
let remote: { inspect: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
async function open() {
  fireEvent.click(screen.getByRole('button', { name: /^(Agentic play|Agentica recovery)$/ }));
  await screen.findByRole('button', { name: 'Inspect original 1' });
}
beforeEach(() => {
  vi.resetAllMocks(); lifetime = new AbortController(); schema = new AbortController();
  mocks.database.mockImplementation(async (input: AbortSignal, read: (signal: AbortSignal) => Promise<unknown>) => {
    const signal = AbortSignal.any([input, schema.signal]); signal.throwIfAborted();
    const value = await read(signal); signal.throwIfAborted(); return value;
  });
  mocks.session = { game: exploreView(), controlled: true, busy: false, recoveryRequired: false, status: 'Ready', saves: [], diagnostics: [],
    controller: { owner: 'owner', get hostSignal() { return lifetime.signal; }, stop: vi.fn(), cleanupHostOperation: vi.fn() } as unknown as GameSession,
    retry: vi.fn(), resetGame: vi.fn(), takeControl: vi.fn(), refreshSaves: vi.fn(), flush: vi.fn(),
    createManualSave: vi.fn(), loadSave: vi.fn(), removeSave: vi.fn() };
  mocks.list.mockImplementation(async () => inventory()); mocks.inspect.mockResolvedValue(detail);
  mocks.readLaunch.mockImplementation(async () => ({ head: inventory().fence, value: { binding: { launchId: 'root-launch' }, grant: null } }));
  remote = { inspect: vi.fn(async () => ({ status: 'identified', settled: false })),
    stop: vi.fn(async () => ({ status: 'stop-requested', localStopped: true, settled: false })), close: vi.fn() };
  mocks.initial.mockResolvedValue(remote); mocks.granted.mockResolvedValue(remote);
  vi.stubGlobal('fetch', vi.fn()); vi.stubGlobal('WebSocket', vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('actual App recovery entry', () => {
  it('opens locally, inspects exactly one original, and remains offline across rerender and close', async () => {
    const { rerender } = render(<App />); await open();
    expect(mocks.inspect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect original 1' }));
    expect(await screen.findByRole('region', { name: 'Original action inspection' })).toHaveTextContent('original-action');
    expect(mocks.inspect).toHaveBeenCalledExactlyOnceWith(inventory().fence, candidate, { signal: expect.any(AbortSignal) });
    rerender(<App />);
    expect(mocks.list).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(mocks.initial).not.toHaveBeenCalled(); expect(mocks.granted).not.toHaveBeenCalled();
    expect(mocks.database).not.toHaveBeenCalled();
    expect(mocks.readLaunch).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); expect(WebSocket).not.toHaveBeenCalled();
    expect(mocks.session.controller.stop).not.toHaveBeenCalled();
  });

  it('keeps the selected predecessor inspectable without duplicating a listed allocation', async () => {
    mocks.list.mockResolvedValue({ ...inventory(), selected: { reference: { key: 'selected', id: 'selected' }, binding: candidate.binding, predecessor: candidate } });
    render(<App />); await open();
    expect(screen.getAllByRole('button', { name: /Inspect original/ })).toHaveLength(1);
    expect(screen.getByText('Selected predecessor')).toBeVisible();
  });

  it('does not infer clearance from an empty local inventory', async () => {
    mocks.list.mockResolvedValue({ ...inventory(), active: null, allocations: [] });
    render(<App />); fireEvent.click(screen.getByRole('button', { name: 'Agentic play' }));
    expect(await screen.findByText('No local recovery entries found.')).toBeVisible();
    expect(screen.getByText('Session clearance').nextElementSibling).toHaveTextContent('Unknown');
    expect(screen.queryByRole('button', { name: 'Check service' })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([false, true])('is reachable without control on the recovery early return (loading: %s)', async busy => {
    mocks.session = { ...mocks.session, game: undefined, controlled: false, recoveryRequired: true, busy, status: 'Storage quota exceeded' };
    render(<App />); await open();
    fireEvent.click(screen.getByRole('button', { name: 'Stop Agentic session' }));
    await waitFor(() => expect(remote.stop).toHaveBeenCalledOnce());
    expect(mocks.initial.mock.calls[0][0]).toBe(mocks.session.controller);
    expect(mocks.initial.mock.calls[0][0].hostSignal).toBe(lifetime.signal);
    expect(lifetime.signal.aborted).toBe(false); expect(mocks.session.controller.stop).not.toHaveBeenCalled();
    await waitFor(() => expect(remote.close).toHaveBeenCalledOnce());
    expect(screen.getByText(/Local Stop recorded; service Stop is pending/)).toBeVisible();
  });

  it.each([false, true])('uses current root grant to choose explicit service recovery (granted: %s)', async granted => {
    mocks.readLaunch.mockResolvedValue({ head: inventory().fence, value: { binding: { launchId: 'root-launch' }, grant: granted ? {} : null } });
    render(<App />); await open();
    expect(mocks.initial).not.toHaveBeenCalled(); expect(mocks.granted).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Check service' }));
    await waitFor(() => expect(remote.close).toHaveBeenCalledOnce());
    expect(granted ? mocks.granted : mocks.initial).toHaveBeenCalledExactlyOnceWith(mocks.session.controller, 'root-launch', expect.any(Function));
    expect(granted ? mocks.initial : mocks.granted).not.toHaveBeenCalled();
    expect(remote.inspect).toHaveBeenCalledOnce(); expect(remote.stop).not.toHaveBeenCalled();
    expect(screen.getByText(/Original root is retained, not settled/)).toBeVisible();
  });

  it('refuses a changed local root before creating a service recovery handle', async () => {
    mocks.readLaunch.mockResolvedValue({ head: inventory().fence, value: { binding: { launchId: 'replacement-root' } } });
    render(<App />); await open(); fireEvent.click(screen.getByRole('button', { name: 'Check service' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Root binding or custody changed');
    expect(mocks.initial).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['Check service', 'Stop Agentic session'])('guards every root read and the whole explicit %s operation', async button => {
    let held = false;
    mocks.database.mockImplementation(async (signal: AbortSignal, read: (signal: AbortSignal) => Promise<unknown>) => {
      held = true;
      try { return await read(signal); } finally { held = false; }
    });
    mocks.readLaunch.mockImplementation(async () => {
      expect(held).toBe(true);
      return { head: inventory().fence, value: { binding: { launchId: 'root-launch' }, grant: null } };
    });
    mocks.initial.mockImplementation(async () => { expect(held).toBe(true); return remote; });
    const operation = button === 'Check service' ? remote.inspect : remote.stop;
    operation.mockImplementation(async () => { expect(held).toBe(true); return { status: 'unknown' }; });
    remote.close.mockImplementation(() => expect(held).toBe(true));
    render(<App />); await open(); fireEvent.click(screen.getByRole('button', { name: button }));
    await waitFor(() => expect(remote.close).toHaveBeenCalledOnce());
    expect(mocks.database).toHaveBeenCalledOnce(); expect(held).toBe(false);
    expect(mocks.session.controller.stop).not.toHaveBeenCalled();
  });

  it.each(['Check service', 'Stop Agentic session'])('rejects %s before ordinary reads when the schema guard fails', async button => {
    mocks.database.mockRejectedValue(new Error('Recovery requires an existing current canonical database; no upgrade was performed.'));
    render(<App />); await open(); fireEvent.click(screen.getByRole('button', { name: button }));
    expect(await screen.findByRole('alert')).toHaveTextContent('no upgrade was performed');
    expect(mocks.readLaunch).not.toHaveBeenCalled();
    expect(mocks.initial).not.toHaveBeenCalled(); expect(mocks.granted).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled(); expect(mocks.session.controller.cleanupHostOperation).not.toHaveBeenCalled();
    expect(mocks.session.resetGame).not.toHaveBeenCalled();
  });

  it('does not initialize a handle after the schema changes during the root read', async () => {
    const pending = deferred<unknown>(); mocks.readLaunch.mockReturnValue(pending.promise);
    render(<App />); await open(); fireEvent.click(screen.getByRole('button', { name: 'Check service' }));
    await waitFor(() => expect(mocks.readLaunch).toHaveBeenCalledOnce());
    schema.abort(new Error('Recovery database schema changed.'));
    await act(async () => { pending.resolve({ head: inventory().fence, value: { binding: { launchId: 'root-launch' } } }); });
    expect(await screen.findByRole('alert')).toHaveTextContent('schema changed');
    expect(mocks.initial).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['Check service', 'Stop Agentic session'])('closes a late %s handle after schema change without invoking it', async button => {
    const pending = deferred<typeof remote>(); mocks.initial.mockReturnValue(pending.promise);
    render(<App />); await open(); fireEvent.click(screen.getByRole('button', { name: button }));
    await waitFor(() => expect(mocks.initial).toHaveBeenCalledOnce());
    schema.abort(new Error('Recovery database schema changed.'));
    await act(async () => { pending.resolve(remote); });
    expect(await screen.findByRole('alert')).toHaveTextContent('schema changed');
    expect(remote.close).toHaveBeenCalledOnce(); expect(remote.inspect).not.toHaveBeenCalled(); expect(remote.stop).not.toHaveBeenCalled();
  });

  it('aborts schema-invalidated service fetches and discards even a late successful response', async () => {
    const pending = deferred<Response>(); let signal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementation((_input, init) => { signal = init!.signal!; return pending.promise; });
    mocks.initial.mockImplementation(async (_port, _id, fetchBound: typeof fetch) => {
      remote.stop.mockImplementation(async () => { await fetchBound('http://localhost/service'); return { status: 'settled' }; });
      return remote;
    });
    render(<App />); await open(); fireEvent.click(screen.getByRole('button', { name: 'Stop Agentic session' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    act(() => schema.abort(new Error('Recovery database schema changed.')));
    expect(signal!.aborted).toBe(true); expect(remote.close).toHaveBeenCalledOnce();
    await act(async () => { pending.resolve({} as Response); });
    expect(await screen.findByRole('alert')).toHaveTextContent('schema changed');
    expect(screen.queryByText(/Root Stop acknowledged/)).not.toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledOnce(); expect(lifetime.signal.aborted).toBe(false);
    expect(remote.close).toHaveBeenCalledOnce(); expect(mocks.session.controller.stop).not.toHaveBeenCalled();
  });

  it('closes the handle after service failure without clearing the retained work', async () => {
    remote.stop.mockRejectedValue(new Error('Service unavailable; original remains unresolved.'));
    render(<App />); await open(); fireEvent.click(screen.getByRole('button', { name: 'Stop Agentic session' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('original remains unresolved');
    expect(remote.close).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Inspect original 1' })).toBeEnabled();
    expect(mocks.session.resetGame).not.toHaveBeenCalled();
  });

  it('closes a late-created handle without calling its network methods after dismissal', async () => {
    const pending = deferred<typeof remote>(); mocks.initial.mockReturnValue(pending.promise);
    render(<App />); await open(); fireEvent.click(screen.getByRole('button', { name: 'Check service' }));
    await waitFor(() => expect(mocks.initial).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    await act(async () => { pending.resolve(remote); });
    expect(remote.close).toHaveBeenCalledOnce(); expect(remote.inspect).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('aborts a pending local read when dismissed', async () => {
    const pending = deferred<RecoveryInventory>(); mocks.list.mockReturnValue(pending.promise);
    render(<App />); fireEvent.click(screen.getByRole('button', { name: 'Agentic play' }));
    const signal = mocks.list.mock.calls[0][0].signal as AbortSignal;
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' })); expect(signal.aborted).toBe(true);
    await act(async () => { pending.resolve(inventory()); }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(['game', 'owner', 'lifetime'])('discards old inspection results after %s changes', async changed => {
    const pending = deferred<RecoveryInspection>(); mocks.inspect.mockReturnValue(pending.promise);
    const { rerender } = render(<App />); await open();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect original 1' }));
    const signal = mocks.inspect.mock.calls[0][2].signal as AbortSignal;
    if (changed === 'game') {
      mocks.session.game = { ...exploreView(), id: 'new-game', snapshot: { ...exploreView().snapshot, gameId: 'new-game', generation: 'new-generation' } };
      mocks.list.mockResolvedValue({ ...inventory(), fence: { ...inventory().fence, gameId: 'new-game', generation: 'new-generation' }, allocations: [], active: null });
    } else if (changed === 'owner') mocks.session.controlled = false;
    else { act(() => lifetime.abort()); lifetime = new AbortController(); }
    rerender(<App />);
    await act(async () => { pending.resolve(detail); });
    expect(signal.aborted).toBe(true);
    expect(screen.queryByText('original-action')).not.toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).queryByRole('region', { name: 'Original action inspection' })).not.toBeInTheDocument();
  });

  it('aborts the scoped fetch on close and blocks duplicate service clicks', async () => {
    let signal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      signal = init!.signal!; signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    mocks.initial.mockImplementation(async (_port, _id, fetchBound: typeof fetch) => {
      remote.inspect.mockImplementation(async () => { await fetchBound('http://localhost/service'); return { status: 'identified', settled: false }; });
      return remote;
    });
    render(<App />); await open(); fireEvent.click(screen.getByRole('button', { name: 'Check service' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Stop Agentic session' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Check service' })); expect(mocks.initial).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(signal!.aborted).toBe(true); await waitFor(() => expect(remote.close).toHaveBeenCalled());
    expect(lifetime.signal.aborted).toBe(false);
  });

  it('does not relabel a replacement game with an old Stop response', async () => {
    const pending = deferred<{ status: string; settled: boolean }>(); remote.stop.mockReturnValue(pending.promise);
    const { rerender } = render(<App />); await open();
    fireEvent.click(screen.getByRole('button', { name: 'Stop Agentic session' }));
    await waitFor(() => expect(remote.stop).toHaveBeenCalledOnce());
    mocks.session.game = { ...exploreView(), id: 'replacement', snapshot: { ...exploreView().snapshot, gameId: 'replacement', generation: 'replacement-generation' } };
    mocks.list.mockResolvedValue({ ...inventory(), active: null, allocations: [],
      fence: { ...inventory().fence, gameId: 'replacement', generation: 'replacement-generation' } });
    rerender(<App />);
    await screen.findByText('No local recovery entries found.');
    await act(async () => { pending.resolve({ status: 'settled', settled: true }); });
    expect(screen.queryByText(/Root Stop acknowledged/)).not.toBeInTheDocument();
    expect(screen.getByText('Session clearance').nextElementSibling).toHaveTextContent('Unknown');
    expect(remote.close).toHaveBeenCalled(); expect(mocks.session.controller.stop).not.toHaveBeenCalled();
  });
});
