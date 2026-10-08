import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createNewGameState } from '../../domain/gameFactory';
import { createVendorItem } from '../../domain/items/loot';
import type { SaveSummary } from '../../domain/types';
import { ExploreScreen } from '../ExploreScreen';
import { BattleScreen } from '../BattleScreen';
import { TownScreen } from '../TownScreen';
import { SavesDialog } from '../SavesDialog';
import { Dialog } from '../Dialog';
import { Controls } from '../Controls';
import { canReceiveTownItem } from './townCapacity';

vi.mock('../MazeCanvas', () => ({ MazeCanvas: () => <canvas aria-label="Maze" /> }));
afterEach(cleanup);
const noop = () => {};
const exploreProps = {
  status: 'Ready', chests: [], autoActive: false, wavesActive: false, autoThrottleMs: 500,
  onMove: noop, onAutoToggle: noop, onWavesToggle: noop, onAutoThrottleChange: noop,
  onTown: noop, onCharacters: noop, onSaves: noop, onNewGame: noop, onRandomBattlesChange: noop,
};
const townProps = { onLeave: noop, onRest: noop, onBuy: noop, onAcceptQuest: noop, onClaimQuest: noop, onSellJunk: noop, onWithdrawStash: noop, onCharacters: noop, onSaves: noop };
const battleProps = { now: 1000, onRound: noop, onSkill: noop, onAutoBattleChange: noop, autoActive: false, wavesActive: false, autoThrottleMs: 500, onAutoToggle: noop, onWavesToggle: noop, onAutoThrottleChange: noop, onEnd: noop, onCharacters: noop, onSaves: noop };
const battle = { id: 'battle', wave: 1, status: 'active' as const, round: 1, enemies: [], log: ['An enemy attacks.'] };
const save: SaveSummary = { slotId: 'manual-one', label: 'Before descent', kind: 'manual', updatedAt: '2026-10-08T12:00:00Z', dungeonLevel: 3, partyLevels: { warrior: 2, mage: 3, healer: 4 } };

describe('exploration controls', () => {
  it('counts stacks and disables the portal at zero without calling the controller', () => {
    const game = createNewGameState();
    game.inventory.items = [{ ...createVendorItem('town-portal'), quantity: 3 }, createVendorItem('town-portal')];
    const onTown = vi.fn();
    const { rerender } = render(<ExploreScreen {...exploreProps} game={game} onTown={onTown} />);
    fireEvent.click(screen.getByRole('button', { name: 'Portal (4)' }));
    expect(onTown).toHaveBeenCalledOnce();
    game.inventory.items = [];
    rerender(<ExploreScreen {...exploreProps} game={game} onTown={onTown} />);
    expect(screen.getByRole('button', { name: 'Portal (0)' })).toBeDisabled();
  });
  it('shows a blocked reason and an immediate auto stop', () => {
    const game = createNewGameState();
    game.autopilot = { phase: 'blocked', floor: 1, route: [], stalledTicks: 1, reason: 'No route to guild cache', targetId: 'Guild cache' };
    const onAutoToggle = vi.fn();
    render(<ExploreScreen {...exploreProps} game={game} autoActive onAutoToggle={onAutoToggle} />);
    expect(screen.getByRole('status')).toHaveTextContent('Auto blocked');
    expect(screen.getByRole('status')).toHaveTextContent('Objective: Guild cache. No route to guild cache');
    fireEvent.click(screen.getByRole('button', { name: 'Stop Auto' }));
    expect(onAutoToggle).toHaveBeenCalledOnce();
  });
  it('requires confirmation for a new game and exposes diagnostics', async () => {
    const onNewGame = vi.fn();
    const onDiagnostics = vi.fn();
    render(<ExploreScreen {...exploreProps} game={createNewGameState()} onNewGame={onNewGame} onDiagnostics={onDiagnostics} />);
    fireEvent.click(screen.getByRole('button', { name: 'Diagnostics' }));
    expect(onDiagnostics).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Expedition settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'New game' }));
    expect(onNewGame).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onNewGame).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Expedition settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'New game' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start new game' }));
    await waitFor(() => expect(onNewGame).toHaveBeenCalledOnce());
  });
});

describe('battle controls', () => {
  it('retains selected member and vitals across the separate log view', () => {
    const game = createNewGameState();
    render(<BattleScreen {...battleProps} party={game.party} battle={battle} />);
    const selector = screen.getByRole('navigation', { name: 'Battle party members' });
    fireEvent.click(within(selector).getByRole('button', { name: new RegExp(game.party[1].displayName) }));
    fireEvent.click(screen.getByRole('tab', { name: 'Log' }));
    expect(screen.getByLabelText('Battle log')).toHaveTextContent('An enemy attacks.');
    expect(screen.getByRole('article', { name: game.party[1].displayName })).toHaveClass('is-selected-member');
    expect(screen.getAllByText('HP').length).toBe(3);
    fireEvent.click(screen.getByRole('tab', { name: 'Skills' }));
    expect(screen.getByRole('article', { name: game.party[1].displayName })).toHaveClass('is-selected-member');
  });
  it('keeps skill names stable, disables unavailable skills, and calls the exact actor', () => {
    const game = createNewGameState();
    game.party[0].gcdUntil = 3000;
    const onSkill = vi.fn();
    const { rerender } = render(<BattleScreen {...battleProps} party={game.party} battle={battle} onSkill={onSkill} />);
    expect(screen.getByRole('button', { name: 'Slash' })).toBeDisabled();
    rerender(<BattleScreen {...battleProps} now={4000} party={game.party} battle={battle} onSkill={onSkill} />);
    fireEvent.click(screen.getByRole('button', { name: 'Slash' }));
    expect(onSkill).toHaveBeenCalledWith(game.party[0].id, 'slash');
  });
  it('uses atomic automation stop when supplied, and exposes diagnostics and reason', () => {
    const onStopAutomation = vi.fn();
    const onAutoToggle = vi.fn();
    const onDiagnostics = vi.fn();
    render(<BattleScreen {...battleProps} party={createNewGameState().party} battle={battle} autoActive wavesActive onAutoToggle={onAutoToggle} onStopAutomation={onStopAutomation} onDiagnostics={onDiagnostics}
      autopilot={{ phase: 'blocked', floor: 1, reason: 'Awaiting recovery', route: [], stalledTicks: 0 }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Stop Auto' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop Waves' }));
    expect(onStopAutomation).toHaveBeenCalledTimes(2);
    expect(onAutoToggle).not.toHaveBeenCalled();
    expect(screen.getByText('Awaiting recovery')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Diagnostics' }));
    expect(onDiagnostics).toHaveBeenCalledOnce();
  });
});

describe('town', () => {
  it('shows all stash entries, supports search and exact-item withdrawals', () => {
    const game = createNewGameState({ mode: 'town' });
    game.stash.items = Array.from({ length: 12 }, (_, index) => ({ ...createVendorItem('rusty-sword'), displayName: `Sword ${index}` }));
    const onWithdrawStash = vi.fn();
    render(<TownScreen {...townProps} game={game} onWithdrawStash={onWithdrawStash} />);
    expect(screen.getAllByRole('button', { name: 'Withdraw' })).toHaveLength(12);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search storage' }), { target: { value: 'Sword 11' } });
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(onWithdrawStash).toHaveBeenCalledWith(game.stash.items[11].id);
  });
  it('permits compatible consumable stacking at capacity and rejects equipment', () => {
    const herb = createVendorItem('health-herb');
    const container = { capacity: 1, items: [herb] };
    expect(canReceiveTownItem(container, createVendorItem('health-herb'))).toBe(true);
    expect(canReceiveTownItem(container, createVendorItem('rusty-sword'))).toBe(false);
    expect(container.items).toEqual([herb]);
    const game = createNewGameState({ mode: 'town' });
    game.inventory = { ...container, gold: 100 };
    render(<TownScreen {...townProps} game={game} />);
    expect(screen.getByRole('button', { name: 'Buy 6g' })).toBeEnabled();
    expect(screen.getAllByText('Pack full').length).toBeGreaterThan(0);
  });
  it('shows prior-floor quest progress and exposes claim without a current contract', () => {
    const game = createNewGameState({ mode: 'town' });
    game.quests = [{ id: 'old', source: 'guild', floor: 7, originRoomId: 'hub', targetRoomId: 'room', targetRoomName: 'Old room', targetRoomKind: 'boss', title: 'Old contract', description: 'Clear old room', task: { objective: 'kill', noun: 'hostiles', progress: 3, required: 3 }, reward: { gold: 99 }, status: 'complete', acceptedAt: game.createdAt }];
    const onClaimQuest = vi.fn();
    render(<TownScreen {...townProps} game={game} onClaimQuest={onClaimQuest} />);
    expect(screen.getByText('3/3 hostiles')).toBeVisible();
    expect(screen.getByText('Floor 7 - Old room')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Claim' }));
    expect(onClaimQuest).toHaveBeenCalledWith('old');
  });
  it('labels obsolete gear sale scope and protections and still requires confirmation', async () => {
    const game = createNewGameState({ mode: 'town' });
    game.inventory.items.push({ ...createVendorItem('rusty-sword'), displayName: 'Obsolete test sword', stats: {}, value: 20 });
    const onSellJunk = vi.fn();
    const { rerender } = render(<TownScreen {...townProps} game={game} onSellJunk={onSellJunk} />);
    const sale = screen.getByRole('button', { name: 'Sell obsolete gear (1) - 10g (pack and stash)' });
    expect(sale).toHaveAttribute('title', 'All rarities. Keeps upgrades, equipped or locked gear, quest items and supplies.');
    fireEvent.click(sale);
    const confirmation = screen.getByRole('dialog', { name: 'Sell obsolete gear?' });
    expect(confirmation).toHaveTextContent('Sell 1 obsolete gear item from pack and stash for 10g: Obsolete test sword.');
    expect(confirmation).toHaveTextContent('All rarities are eligible. Upgrades, equipped or locked gear, quest items and supplies are kept. This cannot be undone.');
    expect(onSellJunk).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }));
    expect(onSellJunk).not.toHaveBeenCalled();
    fireEvent.click(sale);
    fireEvent.click(screen.getByRole('button', { name: 'Sell obsolete gear' }));
    await waitFor(() => expect(onSellJunk).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    rerender(<TownScreen {...townProps} game={{ ...game, inventory: { ...game.inventory, items: [] } }} onSellJunk={onSellJunk} />);
    expect(screen.getByRole('button', { name: 'Sell obsolete gear (0) - 0g (pack and stash)' })).toBeDisabled();
  });
  it('wires optional deposit, lock, policy, stop and diagnostics callbacks', () => {
    const game = createNewGameState({ mode: 'town' });
    game.inventoryPolicy = { autoEquip: true, autoSellJunk: false, autoStash: false, autoRestock: false, healthReserve: 1, manaReserve: 1, portalReserve: 1 };
    const onStashItem = vi.fn(), onToggleItemLock = vi.fn(), onInventoryPolicyChange = vi.fn(), onAutoToggle = vi.fn(), onDiagnostics = vi.fn();
    render(<TownScreen {...townProps} game={game} autoActive onStashItem={onStashItem} onToggleItemLock={onToggleItemLock} onInventoryPolicyChange={onInventoryPolicyChange} onAutoToggle={onAutoToggle} onDiagnostics={onDiagnostics} />);
    fireEvent.click(screen.getByRole('button', { name: /^Pack / }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Deposit' })[0]);
    expect(onStashItem).toHaveBeenCalledWith(game.inventory.items[0].id);
    fireEvent.click(screen.getByRole('button', { name: `Lock ${game.inventory.items[0].displayName}` }));
    expect(onToggleItemLock).toHaveBeenCalledWith(game.inventory.items[0].id);
    fireEvent.click(screen.getByLabelText('Auto sell obsolete gear (pack and stash, all rarities)'));
    expect(onInventoryPolicyChange).toHaveBeenCalledWith({ ...game.inventoryPolicy, autoSellJunk: true });
    fireEvent.click(screen.getByRole('button', { name: 'Stop Auto' }));
    expect(onAutoToggle).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Diagnostics' }));
    expect(onDiagnostics).toHaveBeenCalledOnce();
  });
});

describe('save and dialog safety', () => {
  it.each(['Load', 'Delete'])('requires confirmation before %s and preserves the exact slot id', async (action) => {
    const callback = vi.fn();
    render(<SavesDialog saves={[save]} onClose={noop} onCreateSave={noop} onLoadSave={callback} onDeleteSave={callback} />);
    expect(screen.getByText('Warrior 2 - Mage 3 - Healer 4')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: action }));
    expect(callback).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(callback).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: action }));
    fireEvent.click(screen.getByRole('button', { name: `${action} save` }));
    await waitFor(() => expect(callback).toHaveBeenCalledWith(save.slotId));
  });
  it('keeps a failed deletion visible and retryable', async () => {
    render(<SavesDialog saves={[save]} onClose={noop} onCreateSave={noop} onLoadSave={noop} onDeleteSave={async () => { throw new Error('Disk unavailable'); }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Disk unavailable');
    expect(screen.getByRole('button', { name: 'Delete save' })).toBeEnabled();
  });
  it('prevents duplicate saves while persistence is pending', async () => {
    let resolve!: () => void;
    const onCreateSave = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    render(<SavesDialog saves={[save]} onClose={noop} onCreateSave={onCreateSave} onLoadSave={noop} onDeleteSave={noop} />);
    fireEvent.click(screen.getByRole('button', { name: 'New save' }));
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeDisabled();
    resolve();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Manual save created.'));
    expect(onCreateSave).toHaveBeenCalledOnce();
  });
  it('uses distinct dialog labels and routes native Escape cancellation', () => {
    const onClose = vi.fn();
    render(<><Dialog title="One" onClose={onClose}>First</Dialog><Dialog title="Two" onClose={noop}>Second</Dialog></>);
    expect(screen.getByRole('dialog', { name: 'One' }).getAttribute('aria-labelledby')).not.toBe(screen.getByRole('dialog', { name: 'Two' }).getAttribute('aria-labelledby'));
    fireEvent(screen.getByRole('dialog', { name: 'One' }), new Event('cancel', { bubbles: false, cancelable: true }));
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('preserves direction contracts and disabled movement', () => {
    const onMove = vi.fn();
    const { rerender } = render(<Controls onMove={onMove} />);
    for (const direction of ['north', 'west', 'east', 'south']) fireEvent.click(screen.getByRole('button', { name: `Move ${direction}` }));
    expect(onMove.mock.calls.map(([direction]) => direction)).toEqual(['north', 'west', 'east', 'south']);
    rerender(<Controls onMove={onMove} disabled />);
    expect(screen.getByRole('button', { name: 'Move north' })).toBeDisabled();
  });
});
