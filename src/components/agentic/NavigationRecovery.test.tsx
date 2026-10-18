import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgenticaRecovery } from './AgenticaRecovery';
import { exploreView } from '../ExploreScreen.test-support';
import { candidate, deferred, detail, inventory } from './recovery.test-support';
import type { RecoveryProps } from './useAgenticaRecovery';
import type { GameSession } from '../../services/game/GameSession';

const mocks = vi.hoisted(() => ({ list: vi.fn(), inspect: vi.fn(), navigation: vi.fn(), root: vi.fn(), readLaunch: vi.fn(), database: vi.fn() }));
vi.mock('../../persistence/canonical/agentica/recovery', () => ({ listAgenticaRecovery: mocks.list, inspectAgenticaRecovery: mocks.inspect }));
vi.mock('../../services/agentica/game/navigationRecovery', () => ({ recoverGameNavigation: mocks.navigation }));
vi.mock('../../persistence/canonical/agentica/launch', () => ({ readLaunch: mocks.readLaunch }));
vi.mock('../../persistence/canonical/agentica/recovery.database', () => ({ inRecoveryDatabase: mocks.database }));
vi.mock('../../services/agentica/game/launchRecovery', () => ({ createLaunchRecovery: mocks.root, createGrantedLaunchRecovery: mocks.root }));

let lifetime: AbortController, props: RecoveryProps;
const close = vi.fn();
const mount = () => render(<AgenticaRecovery {...props} onClose={close} />);
async function inspect() {
  fireEvent.click(await screen.findByRole('button', { name: 'Inspect original 1' }));
  await screen.findByRole('button', { name: 'Stop navigation' });
}
beforeEach(() => {
  vi.resetAllMocks(); lifetime = new AbortController();
  props = { controller: { owner: 'owner', hostSignal: lifetime.signal, stop: vi.fn(), cleanupHostOperation: vi.fn(),
    submitHostCommand: vi.fn() } as unknown as GameSession, game: exploreView(), controlled: true };
  mocks.list.mockImplementation(async () => inventory()); mocks.inspect.mockResolvedValue(detail);
  mocks.navigation.mockResolvedValue({ status: 'navigation-stopped' });
  mocks.database.mockImplementation((signal: AbortSignal, work: (signal: AbortSignal) => Promise<unknown>) => work(signal));
  mocks.readLaunch.mockResolvedValue({ head: inventory().fence, value: { binding: { launchId: 'root-launch' }, grant: null } });
  vi.stubGlobal('fetch', vi.fn()); vi.stubGlobal('WebSocket', vi.fn());
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled(); expect(WebSocket).not.toHaveBeenCalled();
  expect(props.controller.stop).not.toHaveBeenCalled(); expect(props.controller.submitHostCommand).not.toHaveBeenCalled();
  cleanup(); vi.unstubAllGlobals();
});

describe('explicit inspected navigation recovery', () => {
  it.each([
    ['stop', { status: 'navigation-stopped' }, 'Local navigation Stop recorded.'],
    ['reconcile', { status: 'terminal-acknowledged', disposition: 'cancelled' }, 'Navigation terminal acknowledged (cancelled).'],
    ['reconcile', { status: 'terminal-prefix-delivered', sequence: 4 }, 'Navigation terminal prefix delivered through sequence 4.'],
    ['reconcile', { status: 'navigation-acknowledged' }, 'Navigation acknowledged.'],
    ['reconcile', { status: 'awaiting-service' }, 'Navigation is awaiting the service.'],
    ['reconcile', { status: 'confirmed' }, 'Navigation recovery remains unresolved.'],
  ] as const)('reports %s / %j without session clearance or an automatic continuation', async (action, result, message) => {
    mocks.navigation.mockResolvedValue(result);
    const view = mount(); await inspect();
    expect(mocks.navigation).not.toHaveBeenCalled();
    expect(detail.candidate).not.toBe(candidate);
    expect(detail.fence).not.toBe((await mocks.list.mock.results[0].value).fence);
    fireEvent.click(screen.getByRole('button', { name: action === 'stop' ? 'Stop navigation' : 'Reconcile navigation' }));
    expect(await screen.findByText(message + ' Session clearance remains unknown.')).toBeVisible();
    const call = mocks.navigation.mock.calls[0];
    expect(mocks.navigation).toHaveBeenCalledOnce(); expect(call[0]).toBe(props.controller);
    expect(call[1]).toBe(detail.fence); expect(call[2]).toBe(detail.candidate); expect(call[3]).toBe(action);
    expect(call[4]).toEqual({ signal: mocks.inspect.mock.calls[0][2].signal });
    expect(call[4].signal).not.toBe(lifetime.signal); expect(call[4].signal.aborted).toBe(false);
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
    expect(mocks.list.mock.calls[1][0].signal).toBe(call[4].signal);
    expect(mocks.inspect).toHaveBeenCalledOnce(); expect(mocks.root).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Reconcile navigation' })).not.toBeInTheDocument();
    expect(screen.getByText('Session clearance').nextElementSibling).toHaveTextContent('Unknown');
    view.rerender(<AgenticaRecovery {...props} onClose={close} />);
    expect(mocks.navigation).toHaveBeenCalledOnce(); expect(mocks.list).toHaveBeenCalledTimes(2);
    await inspect();
    expect(screen.queryByText(message + ' Session clearance remains unknown.')).not.toBeInTheDocument();
    expect(mocks.navigation).toHaveBeenCalledOnce(); expect(mocks.inspect).toHaveBeenCalledTimes(2);
  });

  it.each(['Stop navigation', 'Reconcile navigation'])('serializes duplicate %s clicks with all other work', async button => {
    const pending = deferred<{ status: string }>(); mocks.navigation.mockReturnValue(pending.promise);
    mount(); await inspect(); fireEvent.click(screen.getByRole('button', { name: button }));
    for (const name of ['Stop navigation', 'Reconcile navigation', 'Check service', 'Stop Agentic session', 'Refresh local records', 'Inspect original 1']) {
      const control = screen.getByRole('button', { name }); expect(control).toBeDisabled(); fireEvent.click(control);
    }
    expect(mocks.navigation).toHaveBeenCalledOnce(); expect(mocks.root).not.toHaveBeenCalled();
    expect(mocks.list).toHaveBeenCalledOnce(); expect(mocks.inspect).toHaveBeenCalledOnce();
    await act(async () => { pending.resolve({ status: 'awaiting-service' }); });
    expect(mocks.navigation).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Refresh local records' })).toBeEnabled();
  });

  it.each(['Check service', 'Stop Agentic session'])('disables navigation while %s is pending', async button => {
    const pending = deferred<{ status: string }>();
    mocks.root.mockResolvedValue({ inspect: () => pending.promise, stop: () => pending.promise, close: vi.fn() });
    mount(); await inspect(); fireEvent.click(screen.getByRole('button', { name: button }));
    expect(screen.getByRole('button', { name: 'Stop navigation' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reconcile navigation' }));
    expect(mocks.navigation).not.toHaveBeenCalled();
    await act(async () => { pending.resolve({ status: 'unknown' }); });
  });

  it.each(['closed', 'game', 'owner', 'lifetime'])('discards late navigation success when the view is %s', async changed => {
    const pending = deferred<{ status: string }>(); mocks.navigation.mockReturnValue(pending.promise);
    const view = mount(); await inspect(); fireEvent.click(screen.getByRole('button', { name: 'Reconcile navigation' }));
    const signal = mocks.navigation.mock.calls[0][4].signal as AbortSignal;
    if (changed === 'closed') { fireEvent.click(screen.getByRole('button', { name: 'Close dialog' })); view.unmount(); }
    else if (changed === 'lifetime') act(() => lifetime.abort());
    else {
      if (changed === 'owner') Object.defineProperty(props.controller, 'owner', { value: 'next-owner' });
      else props.game = { ...exploreView(), id: 'replacement', snapshot: { ...exploreView().snapshot, gameId: 'replacement', generation: 'next' } };
      mocks.list.mockResolvedValue({ ...inventory(), allocations: [], active: null,
        fence: { ...inventory().fence, owner: props.controller.owner, gameId: props.game!.id, generation: props.game!.snapshot.generation } });
      view.rerender(<AgenticaRecovery {...props} onClose={close} />);
      await screen.findByText('No local recovery entries found.');
    }
    expect(signal.aborted).toBe(true);
    const reads = mocks.list.mock.calls.length;
    await act(async () => { pending.resolve({ status: 'navigation-acknowledged' }); });
    expect(mocks.list).toHaveBeenCalledTimes(reads); expect(mocks.inspect).toHaveBeenCalledOnce();
    expect(screen.queryByText('Navigation acknowledged. Session clearance remains unknown.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop navigation' })).not.toBeInTheDocument();
    if (changed === 'lifetime') expect(screen.getByRole('button', { name: 'Refresh local records' })).toBeDisabled();
  });

  it.each(['Root binding changed.', 'Recovery owner changed.', 'Recovery database schema changed.'])('surfaces %s without substituting authority or retrying', async error => {
    mocks.navigation.mockRejectedValue(new Error(error + ' Refresh local records.'));
    mount(); await inspect(); fireEvent.click(screen.getByRole('button', { name: 'Reconcile navigation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(error + ' Refresh local records.');
    expect(mocks.navigation).toHaveBeenCalledOnce(); expect(mocks.list).toHaveBeenCalledOnce();
    expect(mocks.navigation.mock.calls[0][1]).toBe(detail.fence); expect(mocks.navigation.mock.calls[0][2]).toBe(detail.candidate);
    const refreshed = { ...inventory(), fence: { ...inventory().fence, revision: 6 } };
    const inspected = { ...detail, fence: { ...refreshed.fence }, candidate: structuredClone(candidate) };
    mocks.list.mockResolvedValue(refreshed); mocks.inspect.mockResolvedValue(inspected);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh local records' })); await inspect();
    mocks.navigation.mockResolvedValue({ status: 'awaiting-service' });
    fireEvent.click(screen.getByRole('button', { name: 'Reconcile navigation' }));
    await screen.findByText('Navigation is awaiting the service. Session clearance remains unknown.');
    expect(mocks.navigation).toHaveBeenCalledTimes(2);
    expect(mocks.navigation.mock.calls[1][1]).toBe(inspected.fence); expect(mocks.navigation.mock.calls[1][2]).toBe(inspected.candidate);
  });

  it('does not report a closed attempt rejection in a newly opened recovery view', async () => {
    const pending = deferred<{ status: string }>(); mocks.navigation.mockReturnValue(pending.promise);
    const first = mount(); await inspect(); fireEvent.click(screen.getByRole('button', { name: 'Stop navigation' }));
    const signal = mocks.navigation.mock.calls[0][4].signal as AbortSignal;
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' })); first.unmount();
    expect(close).toHaveBeenCalledOnce(); expect(signal.aborted).toBe(true);
    mount(); await screen.findByRole('button', { name: 'Inspect original 1' });
    await act(async () => { pending.reject(new Error('Old navigation service reply failed.')); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledTimes(2); expect(mocks.inspect).toHaveBeenCalledOnce();
    expect(mocks.navigation).toHaveBeenCalledOnce(); expect(lifetime.signal.aborted).toBe(false);
    expect(screen.queryByRole('button', { name: 'Stop navigation' })).not.toBeInTheDocument();
  });

  it('does not read or activate recovery for an already ended lifetime', async () => {
    lifetime.abort(); mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Game lifetime ended');
    expect(screen.getByRole('button', { name: 'Refresh local records' })).toBeDisabled();
    expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.navigation).not.toHaveBeenCalled();
  });
});
