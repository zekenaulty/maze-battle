import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { GameDiagnostics } from './GameDiagnostics';
import { exploreView } from '../ExploreScreen.test-support';

const read = vi.hoisted(() => vi.fn());
vi.mock('../../persistence/canonical/telemetry/records', () => ({ readGameplayTelemetry: read }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const snapshot = () => exploreView().snapshot;
const trace = (targetId = 'quest') => ({ sequence: 1, events: [{ sequence: 1, revision: 1,
  at: '2026-10-25T00:00:00.000Z', fact: { kind: 'reward', command: 'claim-quest', targetId,
    walletGoldBefore: 5, walletGoldAfter: 10, lootAwardCount: 0 } }] });

it('reads gameplay only on demand, pins the snapshot and aborts when leaving the tab', async () => {
  read.mockResolvedValue(trace());
  const source = snapshot(); render(<GameDiagnostics snapshot={source} diagnostics={[]} onClose={() => {}} />);
  expect(read).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('tab', { name: 'Gameplay' }));
  await act(async () => {});
  expect(read).toHaveBeenCalledOnce(); expect(read.mock.calls[0][0]).toEqual(source);
  expect(screen.getByText(/r1 \| claim-quest/)).toBeVisible();
  expect(screen.getByText(/"walletGoldAfter": 10/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Storage' }));
  expect(read.mock.calls[0][1].signal.aborted).toBe(true);
  expect(screen.queryByLabelText('Gameplay trace')).not.toBeInTheDocument();
});

it('does not display a superseded read after its snapshot changes', async () => {
  let finish!: (value: unknown) => void;
  read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(trace('current'));
  const source = snapshot(), { rerender } = render(<GameDiagnostics snapshot={source} diagnostics={[]} onClose={() => {}} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Gameplay' }));
  rerender(<GameDiagnostics snapshot={{ ...source, revision: source.revision + 1 }} diagnostics={[]} onClose={() => {}} />);
  await act(async () => { finish(trace('obsolete')); });
  expect(read.mock.calls[0][1].signal.aborted).toBe(true);
  expect(screen.getByText(/"targetId": "current"/)).toBeInTheDocument();
  expect(screen.queryByText(/obsolete/)).not.toBeInTheDocument();
});

it('reports invalid persisted trace without discarding it or attempting a repair', async () => {
  read.mockRejectedValue(new Error('Invalid trace header'));
  render(<GameDiagnostics snapshot={snapshot()} diagnostics={[]} onClose={() => {}} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Gameplay' }));
  await act(async () => {});
  expect(screen.getByRole('alert')).toHaveTextContent('Invalid trace header'); expect(read).toHaveBeenCalledOnce();
});
