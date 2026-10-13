import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TownScreen } from '../TownScreen';
import { townQuestFixture, townViewFixture } from './townViewFixture';

afterEach(cleanup);
const noop = () => {};
const props = { onLeave: noop, onRest: noop, onBuy: noop, onAcceptQuest: noop, onClaimQuest: noop, onSellJunk: noop,
  onWithdrawStash: noop, onCharacters: noop, onSaves: noop, onInventoryPolicyChange: noop };

describe('focused town navigation', () => {
  it('exposes exactly one service and preserves global controls without changing the game', () => {
    const game = townViewFixture();
    const before = structuredClone(game);
    const onAutoToggle = vi.fn();
    render(<TownScreen {...props} game={game} autoActive onAutoToggle={onAutoToggle} />);
    expect(screen.getByRole('tabpanel', { name: 'Guild' })).toBeVisible();
    for (const name of ['Guild', 'Blacksmith', 'Alchemist', 'Storage', 'Inn', 'Auto Care']) {
      const tab = screen.getByRole('tab', { name });
      fireEvent.click(tab);
      expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
      expect(screen.getByRole('tabpanel', { name })).toHaveAttribute('id', tab.getAttribute('aria-controls'));
      expect(screen.getByRole('button', { name: 'Dungeon' })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Party' })).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'Stop Auto' }));
    }
    expect(onAutoToggle).toHaveBeenCalledTimes(6);
    expect(game).toEqual(before);
  });

  it('supports roving keyboard focus and falls back when an optional service disappears', () => {
    const game = townViewFixture();
    const { rerender } = render(<TownScreen {...props} game={game} />);
    const tabs = screen.getByRole('tablist', { name: 'Town services' });
    screen.getByRole('tab', { name: 'Guild' }).focus();
    fireEvent.keyDown(tabs, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Blacksmith' })).toHaveFocus();
    fireEvent.keyDown(tabs, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Auto Care' })).toHaveFocus();
    fireEvent.keyDown(tabs, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Guild' })).toHaveFocus();
    fireEvent.keyDown(tabs, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Auto Care' })).toHaveFocus();
    expect(within(tabs).getAllByRole('tab').filter(tab => tab.tabIndex === 0)).toHaveLength(1);
    rerender(<TownScreen {...props} game={game} onInventoryPolicyChange={undefined} />);
    expect(screen.queryByRole('tab', { name: 'Auto Care' })).not.toBeInTheDocument();
    expect(screen.getByRole('tabpanel', { name: 'Guild' })).toBeVisible();
  });

  it('retains storage filters and selection through service switches and game updates', () => {
    const game = townViewFixture();
    const { rerender } = render(<TownScreen {...props} game={game} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Storage' }));
    fireEvent.click(screen.getByRole('button', { name: /^Pack / }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search storage' }), { target: { value: 'Herb' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Inn' }));
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Storage' }));
    rerender(<TownScreen {...props} game={{ ...game, inventory: { ...game.inventory, gold: 999 } }} />);
    expect(screen.getByRole('searchbox', { name: 'Search storage' })).toHaveValue('Herb');
    expect(screen.getByRole('button', { name: /^Pack / })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps completed history out of current contracts and retains its filter across services', () => {
    const game = townViewFixture();
    const quest = townQuestFixture({ title: 'Archived commission', status: 'claimed' });
    game.quests = [quest];
    render(<TownScreen {...props} game={game} />);
    expect(screen.queryByText('Archived commission')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'History (1)' }));
    expect(screen.getByText('Archived commission')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Claimed' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('tab', { name: 'Inn' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Guild' }));
    expect(screen.getByText('Archived commission')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /^Current / }));
    expect(screen.queryByText('Archived commission')).not.toBeInTheDocument();
  });
});
