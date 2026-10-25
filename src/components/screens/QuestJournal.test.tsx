import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { QuestJournalPage } from '../../persistence/canonical/content/journal';
import type { CanonicalSnapshot } from '../../persistence/canonical/types';
import { TownScreen } from '../TownScreen';
import { TownGuild } from './TownGuild';
import { townViewFixture } from './townViewFixture';

const storage = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../../persistence/canonical/content/journal', () => ({ readCanonicalQuestJournal: storage.read }));
const snapshot: CanonicalSnapshot = { generation: 'generation', gameId: 'game', revision: 1,
  roots: { world: 'world', knowledge: 'knowledge', execution: null }, checkpoint: { mode: 'town' } };
const first: QuestJournalPage = { entries: [
  { id: 'earned-complete', title: 'Old commission', floor: 1, status: 'complete', progress: 1, required: 1, noun: 'room', rewardGold: 47 },
  { id: 'earned-active', title: 'Current commission', floor: 8, status: 'active', progress: 0, required: 1, noun: 'room', rewardGold: 131 },
], next: { snapshot, after: 'quests/floor/8/active/earned-active' } };
const last: QuestJournalPage = { entries: [
  { id: 'earned-claimed', title: 'Claimed commission', floor: 9, status: 'claimed', progress: 1, required: 1, noun: 'room', rewardGold: 143 },
] };
const noop = () => {};
const townProps = { onLeave: noop, onRest: noop, onBuy: noop, onAcceptQuest: noop, onClaimQuest: noop,
  onSellJunk: noop, onWithdrawStash: noop, onCharacters: noop, onSaves: noop };
function deferred() {
  let resolve!: (value: { value: QuestJournalPage }) => void;
  const promise = new Promise<{ value: QuestJournalPage }>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => { vi.resetAllMocks(); storage.read.mockResolvedValue({ value: first }); });
afterEach(cleanup);

it('uses the structural Town snapshot only after explicit Journal selection and claims only a completed row', async () => {
  const game = townViewFixture({ snapshot, dungeonLevel: 8 }), before = structuredClone(game), onClaimQuest = vi.fn();
  render(<TownScreen {...townProps} game={game} onClaimQuest={onClaimQuest} />);
  expect(storage.read).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Journal' }));
  await screen.findByText('Old commission');
  expect(storage.read.mock.calls[0].slice(0, 2)).toEqual([snapshot, undefined]);
  expect(screen.getByText('Floor 1')).toBeVisible();
  expect(screen.getByText('complete - 47g')).toBeVisible();
  expect(screen.getByRole('progressbar', { name: 'Old commission progress' })).toHaveAttribute('value', '1');
  expect(screen.getByRole('button', { name: 'Active' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  expect(onClaimQuest).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Claim' }));
  expect(onClaimQuest).toHaveBeenCalledExactlyOnceWith('earned-complete');
  storage.read.mockResolvedValueOnce({ value: last });
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  expect(screen.queryByText('Old commission')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  await screen.findByText('Claimed commission');
  expect(storage.read.mock.calls[1].slice(0, 2)).toEqual([snapshot, first.next]);
  expect(screen.getByText('Page 2')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Claimed' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
  await screen.findByText('Old commission');
  expect(storage.read.mock.calls[2].slice(0, 2)).toEqual([snapshot, undefined]);
  expect(game).toEqual(before);
});

it('makes absent snapshot fixtures explicitly unavailable with no current-root fallback', () => {
  render(<TownGuild game={{ quests: [], contracts: [] }} onAcceptQuest={noop} onClaimQuest={noop} />);
  fireEvent.click(screen.getByRole('button', { name: 'Journal' }));
  expect(screen.getByRole('status')).toHaveTextContent('Quest journal unavailable: no canonical snapshot.');
  expect(screen.queryByText('No accepted quests.')).not.toBeInTheDocument();
  expect(storage.read).not.toHaveBeenCalled();
});

it.each(['generation', 'gameId', 'revision', 'world', 'checkpoint'] as const)('resets page and hides stale results immediately on snapshot %s change', async field => {
  const game = { quests: [], contracts: [], snapshot }, onClaimQuest = vi.fn();
  const { rerender } = render(<TownGuild game={game} onAcceptQuest={noop} onClaimQuest={onClaimQuest} />);
  fireEvent.click(screen.getByRole('button', { name: 'Journal' })); await screen.findByText('Old commission');
  const pending = deferred(); storage.read.mockReturnValueOnce(pending.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  const oldSignal: AbortSignal = storage.read.mock.calls[1][2], changed = structuredClone(snapshot);
  if (field === 'world') changed.roots.world = 'other-world';
  else if (field === 'checkpoint') changed.checkpoint = { mode: 'town', changed: true };
  else if (field === 'revision') changed.revision++;
  else changed[field] = 'other';
  const replacement = deferred(); storage.read.mockReturnValueOnce(replacement.promise);
  rerender(<TownGuild game={{ ...game, snapshot: changed }} onAcceptQuest={noop} onClaimQuest={onClaimQuest} />);
  expect(oldSignal.aborted).toBe(true);
  expect(screen.getByText('Page 1')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Claim' })).not.toBeInTheDocument();
  expect(storage.read.mock.calls[2].slice(0, 2)).toEqual([changed, undefined]);
  await act(async () => pending.resolve({ value: last }));
  expect(screen.queryByText('Claimed commission')).not.toBeInTheDocument();
  await act(async () => replacement.resolve({ value: first }));
  expect(screen.getByText('Old commission')).toBeVisible();
  rerender(<TownGuild game={{ ...game, snapshot: structuredClone(changed) }} onAcceptQuest={noop} onClaimQuest={onClaimQuest} />);
  expect(storage.read).toHaveBeenCalledTimes(3);
  expect(onClaimQuest).not.toHaveBeenCalled();
});

it('cancels on hidden Town service and unmount, with no background journal refresh', async () => {
  const game = townViewFixture({ snapshot }), pending = deferred(); storage.read.mockReturnValueOnce(pending.promise);
  const { rerender, unmount } = render(<TownScreen {...townProps} game={game} />);
  fireEvent.click(screen.getByRole('button', { name: 'Journal' }));
  const signal: AbortSignal = storage.read.mock.calls[0][2];
  fireEvent.click(screen.getByRole('tab', { name: 'Inn' }));
  expect(signal.aborted).toBe(true);
  rerender(<TownScreen {...townProps} game={{ ...game, snapshot: { ...snapshot, revision: 2 } }} />);
  await act(async () => pending.resolve({ value: first }));
  expect(storage.read).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('tab', { name: 'Guild' }));
  await screen.findByText('Old commission');
  expect(storage.read.mock.calls[1].slice(0, 2)).toEqual([{ ...snapshot, revision: 2 }, undefined]);
  const currentSignal: AbortSignal = storage.read.mock.calls[1][2]; unmount(); expect(currentSignal.aborted).toBe(true);
});

it.each([Error('Canonical storage: read budget exhausted'), Error(''), 'failure'])('reports %s without false empty success, retries, and cancels when returning to Current', async error => {
  storage.read.mockRejectedValueOnce(error);
  render(<TownGuild game={{ quests: [], contracts: [], snapshot }} onAcceptQuest={noop} onClaimQuest={noop} />);
  fireEvent.click(screen.getByRole('button', { name: 'Journal' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(error instanceof Error && error.message ? error.message : 'Quest journal unavailable');
  expect(screen.queryByText('No accepted quests.')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  storage.read.mockResolvedValueOnce({ value: { entries: [] } });
  fireEvent.click(screen.getByRole('button', { name: 'Retry journal' }));
  await screen.findByText('No accepted quests.');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  const signal: AbortSignal = storage.read.mock.calls[1][2];
  fireEvent.click(screen.getByRole('button', { name: 'Current (0)' }));
  await waitFor(() => expect(signal.aborted).toBe(true));
  expect(screen.getByText('No current contracts.')).toBeVisible();
});
