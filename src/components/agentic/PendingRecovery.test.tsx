import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgenticaRecovery } from './AgenticaRecovery';
import { exploreView } from '../ExploreScreen.test-support';
import { deferred, detail, inventory } from './recovery.test-support';
import type { RecoveryProps } from './useAgenticaRecovery';
import type { GameSession } from '../../services/game/GameSession';
import { PendingRecoveryInvalidatedError } from '../../services/agentica/game/pendingRecovery.errors';

const m = vi.hoisted(() => ({ list: vi.fn(), inspect: vi.fn(), pending: vi.fn(), exact: vi.fn(), reconcile: vi.fn() }));
vi.mock('../../persistence/canonical/agentica/recovery', () => ({ listAgenticaRecovery: m.list, inspectAgenticaRecovery: m.inspect }));
vi.mock('../../services/agentica/game/pendingActionRecovery', async importOriginal => ({
  ...await importOriginal<typeof import('../../services/agentica/game/pendingActionRecovery')>(),
  listGamePendingActions: m.pending, inspectGamePendingAction: m.exact, reconcileGamePendingAction: m.reconcile,
}));
const item = { actionId: 'pending-action', requestHash: 'request', capabilityHash: 'capability', disposition: null, recoveryRetention: 'reserved' };
const selected = { action: { ...detail.action, actionId: item.actionId, capabilityId: 'maze.inspect' }, descriptor: item };
const claimed = { ...detail, claim: { reference: { key: 'claim', id: 'claim-source' } } };
let props: RecoveryProps, host: AbortController;
const mount = () => render(<AgenticaRecovery {...props} onClose={vi.fn()} />);
const click = async (name: string) => fireEvent.click(await screen.findByRole('button', { name }));
async function select() {
  await click('Inspect original 1'); await click('Check action custody'); await click('Inspect action pending-action');
  await screen.findByRole('button', { name: 'Reconcile pending action' });
}
beforeEach(() => {
  vi.resetAllMocks(); host = new AbortController();
  props = { controller: { owner: 'owner', hostSignal: host.signal, submitHostCommand: vi.fn(), stop: vi.fn() } as unknown as GameSession,
    game: exploreView(), controlled: true };
  m.list.mockImplementation(async () => inventory()); m.inspect.mockResolvedValue(claimed);
  m.pending.mockResolvedValue({ items: [item], nextAfterActionId: null }); m.exact.mockResolvedValue(selected);
  m.reconcile.mockResolvedValue({ status: 'action-reconciled' });
  vi.stubGlobal('fetch', vi.fn()); vi.stubGlobal('WebSocket', vi.fn());
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled(); expect(WebSocket).not.toHaveBeenCalled();
  expect(props.controller.submitHostCommand).not.toHaveBeenCalled(); expect(props.controller.stop).not.toHaveBeenCalled();
  cleanup(); vi.unstubAllGlobals();
});

describe('explicit claimed-run action recovery UI', () => {
  it('discovers the claimed parent after both allocations and selected predecessor are gone', async () => {
    m.list.mockResolvedValue({ ...inventory(), allocations: [], selected: null, claimed: detail.candidate });
    mount(); await screen.findByText('Claimed parent'); await select();
    expect(m.inspect).toHaveBeenCalledExactlyOnceWith(inventory().fence, detail.candidate, { signal: expect.any(AbortSignal) });
    expect(screen.queryByText('No local recovery entries found.')).not.toBeInTheDocument();
  });

  it.each(['root', 'claim', 'schema'])('clears inspected custody after an in-flight %s invalidation', async kind => {
    const pending = deferred<unknown>(); m.reconcile.mockReturnValueOnce(pending.promise);
    mount(); await select(); await click('Reconcile pending action');
    await act(async () => pending.reject(new PendingRecoveryInvalidatedError(new Error(`${kind} changed. Refresh local records.`))));
    expect(await screen.findByRole('alert')).toHaveTextContent(`${kind} changed`);
    expect(screen.queryByRole('region', { name: 'Selected pending action' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check action custody' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Inspect original 1' })).not.toBeInTheDocument();
    expect(m.list).toHaveBeenCalledOnce(); expect(m.reconcile).toHaveBeenCalledOnce();
    await click('Refresh local records'); await select();
    expect(m.exact).toHaveBeenCalledTimes(2); expect(m.reconcile).toHaveBeenCalledOnce();
  });

  it('separates local inspection, page read, exact read and reconciliation', async () => {
    mount(); await click('Inspect original 1');
    expect(m.pending).not.toHaveBeenCalled(); expect(m.exact).not.toHaveBeenCalled(); expect(m.reconcile).not.toHaveBeenCalled();
    await click('Check action custody'); await screen.findByText('pending-action');
    expect(m.pending).toHaveBeenCalledExactlyOnceWith(props.controller, claimed.fence, claimed.candidate,
      { signal: expect.any(AbortSignal), afterActionId: undefined });
    expect(m.exact).not.toHaveBeenCalled(); await click('Inspect action pending-action');
    await screen.findByRole('region', { name: 'Selected pending action' }); expect(m.reconcile).not.toHaveBeenCalled();
    expect(m.exact).toHaveBeenCalledExactlyOnceWith(props.controller, claimed.fence, claimed.candidate, item, { signal: expect.any(AbortSignal) });
    await click('Reconcile pending action');
    await screen.findByText('Action reconciled as unavailable. Root and session clearance remain unknown.');
    expect(m.reconcile).toHaveBeenCalledExactlyOnceWith(props.controller, claimed.fence, claimed.candidate, selected, { signal: expect.any(AbortSignal) });
    await waitFor(() => expect(m.list).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('region', { name: 'Selected pending action' })).not.toBeInTheDocument();
    expect(screen.getByText('Session clearance').nextElementSibling).toHaveTextContent('Unknown');
  });

  it('retains exact selection after an uncertain reply and retries only on another explicit click', async () => {
    m.reconcile.mockRejectedValueOnce(new Error('Reply lost; outcome unknown.'));
    mount(); await select(); await click('Reconcile pending action');
    expect(await screen.findByRole('alert')).toHaveTextContent('Reply lost; outcome unknown.');
    expect(m.reconcile).toHaveBeenCalledOnce(); expect(m.list).toHaveBeenCalledOnce(); expect(m.exact).toHaveBeenCalledOnce();
    expect(screen.getByRole('region', { name: 'Selected pending action' })).toBeVisible();
    await click('Reconcile pending action');
    await screen.findByText('Action reconciled as unavailable. Root and session clearance remain unknown.');
    expect(m.reconcile.mock.calls[1][3]).toBe(selected); expect(m.reconcile).toHaveBeenCalledTimes(2);
  });

  it('pages only on request and discards the previous selection without declaring empty custody clear', async () => {
    m.pending.mockResolvedValueOnce({ items: [item], nextAfterActionId: item.actionId }).mockResolvedValue({ items: [], nextAfterActionId: null });
    mount(); await select(); expect(m.pending).toHaveBeenCalledOnce();
    await click('Next actions'); await screen.findByText('No retained actions in this page. Session clearance remains unknown.');
    expect(m.pending.mock.calls[1][3].afterActionId).toBe(item.actionId);
    expect(screen.queryByRole('button', { name: 'Reconcile pending action' })).not.toBeInTheDocument();
    expect(m.reconcile).not.toHaveBeenCalled();
  });

  it('serializes duplicates and all other recovery controls', async () => {
    const pending = deferred<unknown>(); m.reconcile.mockReturnValue(pending.promise);
    mount(); await select(); await click('Reconcile pending action');
    for (const name of ['Reconcile pending action', 'Check action custody', 'Inspect action pending-action', 'Check service',
      'Stop Agentic session', 'Stop navigation', 'Reconcile navigation', 'Refresh local records', 'Inspect original 1']) {
      const control = screen.getByRole('button', { name }); expect(control).toBeDisabled(); fireEvent.click(control);
    }
    expect(m.reconcile).toHaveBeenCalledOnce(); expect(m.pending).toHaveBeenCalledOnce(); expect(m.exact).toHaveBeenCalledOnce();
    await act(async () => pending.resolve({ status: 'action-reconciled' }));
  });

  it.each(['close', 'lifetime', 'game'])('invalidates selected action and late replies on %s', async changed => {
    const pending = deferred<unknown>(); m.reconcile.mockReturnValue(pending.promise);
    const view = mount(); await select(); await click('Reconcile pending action');
    const signal = m.reconcile.mock.calls[0][4].signal as AbortSignal;
    if (changed === 'close') view.unmount();
    else if (changed === 'lifetime') act(() => host.abort());
    else {
      props = { ...props, game: undefined, controlled: false }; m.list.mockResolvedValue({ ...inventory(), allocations: [], active: null });
      view.rerender(<AgenticaRecovery {...props} onClose={vi.fn()} />); await screen.findByText('No local recovery entries found.');
    }
    expect(signal.aborted).toBe(true); const reads = m.list.mock.calls.length;
    await act(async () => pending.resolve({ status: 'action-reconciled' }));
    expect(m.list).toHaveBeenCalledTimes(reads);
    expect(screen.queryByText('Action reconciled as unavailable. Root and session clearance remain unknown.')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Selected pending action' })).not.toBeInTheDocument();
  });

  it('does not offer remote action discovery without an inspected retained claim', async () => {
    m.inspect.mockResolvedValue(detail); mount(); await click('Inspect original 1'); await screen.findByText('Original navigation');
    expect(screen.queryByRole('button', { name: 'Check action custody' })).not.toBeInTheDocument(); expect(m.pending).not.toHaveBeenCalled();
  });
});
