import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgenticaRecovery } from './AgenticaRecovery';
import { RecoveryDetails } from './RecoveryDetails';
import { exploreView } from '../ExploreScreen.test-support';
import { deferred, detail, inventory } from './recovery.test-support';
import type { RecoveryProps } from './useAgenticaRecovery';
import type { PlayAdoptionOffer } from '../../services/agentica/game/playAdoption';
import type { GameSession } from '../../services/game/GameSession';

const m = vi.hoisted(() => ({ list: vi.fn(), inspect: vi.fn(), offer: vi.fn(), navigation: vi.fn() }));
vi.mock('../../persistence/canonical/agentica/recovery', () => ({ listAgenticaRecovery: m.list, inspectAgenticaRecovery: m.inspect }));
vi.mock('../../services/agentica/game/playAdoption', () => ({ inspectPlayAdoption: m.offer }));
vi.mock('../../services/agentica/game/navigationRecovery', () => ({ recoverGameNavigation: m.navigation }));

// These are UI boundary tests. Eligibility and retained-proof validation belong to inspectPlayAdoption.
const inspected = { ...detail, operation: { ...detail.operation, owner: 'previous-owner', epoch: 0,
  state: 'settled' as const, terminal: { disposition: 'decision' as const, attemptId: 'decision-terminal' } },
  progress: { ...detail.progress, owner: 'previous-owner', epoch: 0, status: 'arrived' as const } };
const offer: PlayAdoptionOffer = { fence: inspected.fence, candidate: inspected.candidate, launchId: inspected.launchId,
  original: { action: inspected.action, binding: inspected.candidate.binding }, objective: 'Continue the retained exploration objective.',
  profile: { endpoint: 'ws://localhost:5259/api/host/retained-profile',
    provider: { provider: 'fixture', model: 'retained-model', contextWindowTokens: 8192, maxOutputTokens: 1024 },
    limits: { maxSteps: 8, maxRefinements: 6, maxPlanContinuations: 2, timeoutSeconds: 90, actionTimeoutSeconds: 20 } }, remainingContinuations: 1 };
let props: RecoveryProps, host: AbortController;
const close = vi.fn(), onAdopt = vi.fn();
const mount = () => render(<AgenticaRecovery {...props} onClose={close} />);
const click = async (name: string) => fireEvent.click(await screen.findByRole('button', { name }));
async function inspect() { await click('Inspect original 1'); await screen.findByRole('button', { name: 'Adopt and continue' }); }
beforeEach(() => {
  vi.resetAllMocks(); host = new AbortController(); const game = exploreView(); game.snapshot.revision = inspected.fence.revision;
  props = { game, controlled: true, onAdopt, controller: { owner: 'owner', hostSignal: host.signal,
    view: { game, controlled: true, busy: false, recoveryRequired: false, status: 'Ready', saves: [], diagnostics: [] },
    submitHostCommand: vi.fn(), cleanupHostOperation: vi.fn(), stop: vi.fn() } as unknown as GameSession };
  m.list.mockImplementation(async () => inventory()); m.inspect.mockResolvedValue(inspected); m.offer.mockResolvedValue(offer);
  m.navigation.mockResolvedValue({ status: 'awaiting-service' });
  vi.stubGlobal('fetch', vi.fn()); vi.stubGlobal('WebSocket', vi.fn());
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled(); expect(WebSocket).not.toHaveBeenCalled();
  expect(props.controller.submitHostCommand).not.toHaveBeenCalled(); expect(props.controller.cleanupHostOperation).not.toHaveBeenCalled();
  expect(props.controller.stop).not.toHaveBeenCalled(); cleanup(); vi.unstubAllGlobals();
});

describe('explicit retained play adoption UI', () => {
  it('inspects locally only after original inspection and forwards the exact offer only on explicit input', async () => {
    const pending = deferred<typeof inspected>(); m.inspect.mockReturnValueOnce(pending.promise);
    const view = mount(); await screen.findByRole('button', { name: 'Inspect original 1' });
    expect(m.offer).not.toHaveBeenCalled(); expect(onAdopt).not.toHaveBeenCalled();
    await click('Inspect original 1'); expect(m.offer).not.toHaveBeenCalled();
    await act(async () => pending.resolve(inspected));
    const button = await screen.findByRole('button', { name: 'Adopt and continue' });
    expect(m.offer).toHaveBeenCalledExactlyOnceWith(props.controller, inspected.fence, inspected.candidate,
      { signal: m.inspect.mock.calls[0][2].signal });
    expect(m.offer.mock.calls[0][3].signal).not.toBe(host.signal);
    for (const value of [offer.objective, offer.profile.endpoint, 'fixture', 'retained-model',
      '8 steps / 6 refinements / 2 continuations', '90 s run / 20 s action', '8192 context / 1024 output'])
      expect(screen.getByText(value)).toBeVisible();
    expect(screen.getByText('Remaining continuations').nextElementSibling).toHaveTextContent('1');
    expect(screen.getByText('Session clearance').nextElementSibling).toHaveTextContent('Unknown');
    view.rerender(<AgenticaRecovery {...props} onClose={close} />);
    expect(m.offer).toHaveBeenCalledOnce(); expect(onAdopt).not.toHaveBeenCalled();
    fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(onAdopt).toHaveBeenCalledExactlyOnceWith(offer));
    expect(onAdopt.mock.calls[0][0]).toBe(offer); expect(m.navigation).not.toHaveBeenCalled();
    expect(m.list).toHaveBeenCalledOnce(); expect(m.inspect).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Adopt and continue' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop Agentic session' })).toBeEnabled();
  });

  it.each(['null', 'refused'])('keeps cleanup available when the local offer is %s', async result => {
    if (result === 'null') m.offer.mockResolvedValue(null); else m.offer.mockRejectedValue(new Error('Original is no longer eligible.'));
    mount(); await click('Inspect original 1'); await waitFor(() => expect(m.offer).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop navigation' })).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Reconcile navigation' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Stop Agentic session' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Adopt and continue' })).not.toBeInTheDocument();
    expect(onAdopt).not.toHaveBeenCalled();
    if (result === 'refused') expect(screen.getByRole('alert')).toHaveTextContent('Original is no longer eligible.');
  });

  it.each(['callback', 'controlled', 'view-control', 'missing-game', 'different-game', 'generation', 'revision', 'town', 'auto', 'town-auto', 'prop-auto', 'prop-town-auto', 'busy', 'recovery'])
  ('does not request an offer without %s eligibility and preserves cleanup', async reason => {
    const current = props.controller.view;
    if (reason === 'callback') props.onAdopt = undefined;
    else if (reason === 'controlled') props.controlled = false;
    else if (reason === 'view-control') current.controlled = false;
    else if (reason === 'missing-game') props.game = undefined;
    else if (reason === 'different-game') current.game = { ...current.game!, id: 'other-game' };
    else if (reason === 'generation' || reason === 'revision') current.game = { ...current.game!, snapshot: { ...current.game!.snapshot,
      ...(reason === 'generation' ? { generation: 'other-generation' } : { revision: 7 }) } };
    else if (reason === 'town' || reason === 'auto') current.game = { ...current.game!, mode: reason === 'town' ? 'town' : 'auto-play' };
    else if (reason === 'town-auto') current.game = { ...current.game!, checkpoint: { ...current.game!.checkpoint, townReturnMode: 'auto-play' } };
    else if (reason === 'prop-auto') props.game = { ...props.game!, mode: 'auto-play' };
    else if (reason === 'prop-town-auto') props.game = { ...props.game!, checkpoint: { ...props.game!.checkpoint, townReturnMode: 'auto-play' } };
    else if (reason === 'busy') current.busy = true; else current.recoveryRequired = true;
    mount(); await click('Inspect original 1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop navigation' })).toBeEnabled());
    expect(m.offer).not.toHaveBeenCalled(); expect(onAdopt).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Adopt and continue' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop Agentic session' })).toBeEnabled();
  });

  it('serializes original inspection and disables adoption during existing cleanup', async () => {
    const pending = deferred<PlayAdoptionOffer | null>(); m.offer.mockReturnValueOnce(pending.promise);
    mount(); await click('Inspect original 1'); await waitFor(() => expect(m.offer).toHaveBeenCalledOnce());
    for (const name of ['Inspect original 1', 'Refresh local records', 'Stop Agentic session', 'Stop navigation']) {
      const button = screen.getByRole('button', { name }); expect(button).toBeDisabled(); fireEvent.click(button);
    }
    expect(m.inspect).toHaveBeenCalledOnce(); expect(m.navigation).not.toHaveBeenCalled();
    await act(async () => pending.resolve(offer));
    const cleanup = deferred<{ status: string }>(); m.navigation.mockReturnValueOnce(cleanup.promise);
    await click('Reconcile navigation');
    const button = screen.getByRole('button', { name: 'Adopt and continue' }); expect(button).toBeDisabled(); fireEvent.click(button);
    expect(onAdopt).not.toHaveBeenCalled();
    await act(async () => cleanup.resolve({ status: 'awaiting-service' }));
    expect(screen.queryByRole('button', { name: 'Adopt and continue' })).not.toBeInTheDocument();
    expect(m.offer).toHaveBeenCalledOnce();
  });

  it.each(['refresh', 'reinspect'])('discards the previous offer before %s, without automatically choosing another', async action => {
    mount(); await inspect(); m.offer.mockResolvedValueOnce(null);
    await click(action === 'refresh' ? 'Refresh local records' : 'Inspect original 1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Inspect original 1' })).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Adopt and continue' })).not.toBeInTheDocument();
    expect(m.offer).toHaveBeenCalledTimes(action === 'refresh' ? 1 : 2); expect(onAdopt).not.toHaveBeenCalled();
  });

  it.each(['revision', 'busy', 'auto', 'callback'])('cannot revive an old offer after %s changes and returns', async reason => {
    const view = mount(); await inspect(); const game = props.game, callback = props.onAdopt;
    if (reason === 'revision') props.game = { ...game!, snapshot: { ...game!.snapshot, revision: game!.snapshot.revision + 1 } };
    else if (reason === 'busy') props.controller.view.busy = true;
    else if (reason === 'auto') props.controller.view.game = { ...game!, mode: 'auto-play' };
    else props.onAdopt = undefined;
    view.rerender(<AgenticaRecovery {...props} onClose={close} />);
    expect(screen.queryByRole('button', { name: 'Adopt and continue' })).not.toBeInTheDocument();
    props.game = game; props.onAdopt = callback; props.controller.view.busy = false; props.controller.view.game = game;
    view.rerender(<AgenticaRecovery {...props} onClose={close} />);
    expect(screen.queryByRole('button', { name: 'Adopt and continue' })).not.toBeInTheDocument();
    expect(m.offer).toHaveBeenCalledOnce(); expect(onAdopt).not.toHaveBeenCalled();
    await inspect(); expect(m.offer).toHaveBeenCalledTimes(2);
  });

  it.each(['closed', 'lifetime', 'owner', 'revision', 'readonly'])('discards a late local offer after %s changes', async reason => {
    const pending = deferred<PlayAdoptionOffer | null>(); m.offer.mockReturnValueOnce(pending.promise);
    const view = mount(); await click('Inspect original 1'); await waitFor(() => expect(m.offer).toHaveBeenCalledOnce());
    const signal = m.offer.mock.calls[0][3].signal as AbortSignal;
    if (reason === 'closed') { await click('Close dialog'); view.unmount(); }
    else if (reason === 'lifetime') act(() => host.abort());
    else {
      if (reason === 'owner') Object.defineProperty(props.controller, 'owner', { value: 'new-owner' });
      else if (reason === 'readonly') props.controlled = false;
      else props.game = { ...props.game!, snapshot: { ...props.game!.snapshot, revision: 7 } };
      view.rerender(<AgenticaRecovery {...props} onClose={close} />);
    }
    if (reason !== 'revision') expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(offer));
    expect(screen.queryByRole('button', { name: 'Adopt and continue' })).not.toBeInTheDocument();
    expect(onAdopt).not.toHaveBeenCalled(); expect(m.offer).toHaveBeenCalledOnce();
  });

  it('rechecks live readiness on click even before a parent rerender', async () => {
    mount(); await inspect(); props.controller.view.busy = true;
    await click('Adopt and continue'); expect(onAdopt).not.toHaveBeenCalled();
  });

  it('surfaces a synchronous parent refusal without retry or synthesized execution', async () => {
    onAdopt.mockImplementation(() => { throw new Error('Retained ownership changed. Inspect again.'); });
    mount(); await inspect(); await click('Adopt and continue');
    expect(await screen.findByRole('alert')).toHaveTextContent('Retained ownership changed. Inspect again.');
    expect(onAdopt).toHaveBeenCalledOnce(); expect(m.offer).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Adopt and continue' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop navigation' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reconcile navigation' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Stop Agentic session' })).toBeEnabled();
  });

  it('keeps the details action disabled without an explicit callback', () => {
    render(<RecoveryDetails detail={inspected} disabled={false} adoptionOffer={offer} onRecover={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Adopt and continue' }); expect(button).toBeDisabled(); fireEvent.click(button);
    expect(onAdopt).not.toHaveBeenCalled();
  });
});
