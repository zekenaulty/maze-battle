import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGuildContract } from '../../domain/guild/contractFactory';
import { TownGuild } from './TownGuild';
import { townQuestFixture } from './townViewFixture';

vi.mock('../../domain/guild/contracts', () => { throw new Error('Town must not query legacy floor contracts'); });
afterEach(cleanup);
const noop = () => {};
const contract = createGuildContract({ floor: 4, originRoomId: 'known-guild', target: { id: 'supplied', kind: 'safe', name: 'Supplied Archive' } });

describe('bounded guild projection', () => {
  it('renders only supplied contracts and passes the exact accepted identity', () => {
    const game = { quests: [], contracts: [contract] }, before = structuredClone(game), onAcceptQuest = vi.fn();
    render(<TownGuild game={game} onAcceptQuest={onAcceptQuest} onClaimQuest={noop} />);
    expect(screen.getByText(contract.title)).toBeVisible();
    expect(screen.getByText(contract.description)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(onAcceptQuest).toHaveBeenCalledExactlyOnceWith(contract.id);
    expect(game).toEqual(before);
  });

  it('keeps claimed duplicates out of posted contracts and supports an empty supplied list', () => {
    const game = { contracts: [contract], quests: [townQuestFixture({ id: contract.id, title: contract.title, status: 'claimed' })] };
    const { rerender } = render(<TownGuild game={game} onAcceptQuest={noop} onClaimQuest={noop} />);
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
    expect(screen.getByText('No current contracts.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'History (1)' }));
    expect(screen.getByText(contract.title)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Claimed' })).toBeDisabled();
    rerender(<TownGuild game={{ contracts: [], quests: [] }} onAcceptQuest={noop} onClaimQuest={noop} />);
    fireEvent.click(screen.getByRole('button', { name: 'Current (0)' }));
    expect(screen.getByText('No current contracts.')).toBeVisible();
  });
});
