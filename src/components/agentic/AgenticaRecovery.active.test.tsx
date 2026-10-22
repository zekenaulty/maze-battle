import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AgenticaRecovery } from './AgenticaRecovery';
import { exploreView } from '../ExploreScreen.test-support';
import { deferred, detail, inventory } from './recovery.test-support';
import type { RecoveryProps } from './useAgenticaRecovery';
import type { ActiveNavigationOffer } from '../../services/agentica/game/playActiveNavigation';
import type { GameSession } from '../../services/game/GameSession';

const m = vi.hoisted(() => ({ list: vi.fn(), inspect: vi.fn(), offer: vi.fn(), resume: vi.fn(), adoption: vi.fn() }));
vi.mock('../../persistence/canonical/agentica/recovery', () => ({ listAgenticaRecovery: m.list, inspectAgenticaRecovery: m.inspect }));
vi.mock('../../services/agentica/game/playActiveNavigation', () => ({ inspectActiveNavigation: m.offer }));
vi.mock('../../services/agentica/game/playAdoption', () => ({ inspectPlayAdoption: m.adoption }));
const inspected = { ...detail, operation: { ...detail.operation, state: 'admitted' as const, terminal: undefined },
  progress: { ...detail.progress, status: 'running' as const, steps: 1 } };
const offer = { fence: detail.fence, candidate: detail.candidate, launchId: detail.launchId,
  original: { action: detail.action, binding: detail.candidate.binding }, progress: inspected.progress } as ActiveNavigationOffer;
let props: RecoveryProps, host: AbortController;
const click = async (name: string) => fireEvent.click(await screen.findByRole('button', { name }));
beforeEach(() => {
  vi.resetAllMocks(); host = new AbortController(); const game = exploreView(); game.snapshot.revision = detail.fence.revision;
  props = { game, controlled: true, onResume: m.resume, controller: { owner: 'owner', hostSignal: host.signal,
    view: { game, controlled: true, busy: false, recoveryRequired: false }, submitHostCommand: vi.fn() } as unknown as GameSession };
  m.list.mockResolvedValue(inventory()); m.inspect.mockResolvedValue(inspected); m.offer.mockResolvedValue(offer);
});
afterEach(cleanup);
it('offers Resume only after inspection and sends one exact explicit selection', async () => {
  render(<AgenticaRecovery {...props} onClose={vi.fn()} />);
  await screen.findByRole('button', { name: 'Inspect original 1' }); expect(m.offer).not.toHaveBeenCalled();
  await click('Inspect original 1'); const button = await screen.findByRole('button', { name: 'Resume navigation' });
  expect(m.resume).not.toHaveBeenCalled(); fireEvent.click(button); fireEvent.click(button);
  await waitFor(() => expect(m.resume).toHaveBeenCalledExactlyOnceWith(offer));
  expect(m.adoption).not.toHaveBeenCalled(); expect(props.controller.submitHostCommand).not.toHaveBeenCalled();
});
it.each(['revision', 'control', 'lifetime'])('discards stale Resume on %s change, including a saved callback', async reason => {
  const view = render(<AgenticaRecovery {...props} onClose={vi.fn()} />); await click('Inspect original 1');
  const button = await screen.findByRole('button', { name: 'Resume navigation' });
  if (reason === 'revision') props.game = { ...props.game!, snapshot: { ...props.game!.snapshot, revision: detail.fence.revision + 1 } };
  if (reason === 'control') props.controlled = false;
  if (reason === 'lifetime') await act(async () => host.abort());
  view.rerender(<AgenticaRecovery {...props} onClose={vi.fn()} />); fireEvent.click(button);
  expect(m.resume).not.toHaveBeenCalled(); expect(screen.queryByRole('button', { name: 'Resume navigation' })).not.toBeInTheDocument();
});
it('does not publish a late offer after owner/control changes', async () => {
  const pending = deferred<ActiveNavigationOffer | null>(); m.offer.mockReturnValueOnce(pending.promise);
  const view = render(<AgenticaRecovery {...props} onClose={vi.fn()} />); await click('Inspect original 1');
  await waitFor(() => expect(m.offer).toHaveBeenCalledOnce()); props.controlled = false;
  view.rerender(<AgenticaRecovery {...props} onClose={vi.fn()} />); await act(async () => pending.resolve(offer));
  expect(screen.queryByRole('button', { name: 'Resume navigation' })).not.toBeInTheDocument(); expect(m.resume).not.toHaveBeenCalled();
});
it('keeps Stop/Reconcile available when transfer proof is refused', async () => {
  m.offer.mockRejectedValue(Error('Original transfer ACK unresolved'));
  render(<AgenticaRecovery {...props} onClose={vi.fn()} />); await click('Inspect original 1');
  expect(await screen.findByRole('alert')).toHaveTextContent('Original transfer ACK unresolved');
  expect(screen.getByRole('button', { name: 'Stop navigation' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Reconcile navigation' })).toBeEnabled(); expect(m.resume).not.toHaveBeenCalled();
});
