import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buyVendorItem, stashItem, withdrawStashItem } from '../../domain/items/inventory';
import { createVendorItem } from '../../domain/items/loot';
import { characterFixture, itemFixture } from '../../viewModels/characterTestFixtures';
import { TownScreen, type TownView } from '../TownScreen';
import { TownStorage } from './TownStorage';
import { TownVendor } from './TownVendor';
import { canReceiveTownItem } from './townCapacity';
import { townViewFixture } from './townViewFixture';

afterEach(cleanup);
const noop = () => {};

function town(): TownView {
  const worn = itemFixture({ id: 'worn' });
  return {
    ...townViewFixture(),
    party: [characterFixture({ equipment: { weapon: worn.id } })],
    inventory: { gold: 1000, capacity: 1, items: [worn] },
    stash: { capacity: 1, items: [itemFixture({ id: 'stored', displayName: 'Stored Sword' })] },
  };
}

describe('town capacity UI', () => {
  it('shows the same bag-only count in the town header and storage without mutating ownership', () => {
    const game = town();
    const before = structuredClone(game);
    const { container } = render(<TownScreen game={game} onLeave={noop} onRest={noop} onBuy={noop} onAcceptQuest={noop} onClaimQuest={noop} onSellJunk={noop} onWithdrawStash={noop} onCharacters={noop} onSaves={noop} />);
    expect(container.querySelector('.screen-status')).toHaveTextContent('Pack 0/1 - Stash 1/1');
    fireEvent.click(screen.getByRole('tab', { name: 'Storage' }));
    expect(screen.getByRole('button', { name: 'Pack 0/1' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Stash 1/1' })).toBeVisible();
    expect(game).toEqual(before);
  });

  it('allows withdrawal with worn exclusions, then disables it when the bag fills', () => {
    const game = town();
    const onWithdrawStash = vi.fn();
    const { rerender } = render(<TownStorage game={game} onSellJunk={noop} onWithdrawStash={onWithdrawStash} />);
    const stored = game.stash.items[0];
    expect(canReceiveTownItem(game, stored)).toBe(true);
    expect(withdrawStashItem(game, stored.id)).not.toBe(game);
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(onWithdrawStash).toHaveBeenCalledExactlyOnceWith(stored.id);
    const full = { ...game, inventory: { ...game.inventory, items: [...game.inventory.items, itemFixture({ id: 'bag' })] } };
    rerender(<TownStorage game={full} onSellJunk={noop} onWithdrawStash={onWithdrawStash} />);
    expect(canReceiveTownItem(full, stored)).toBe(false);
    expect(withdrawStashItem(full, stored.id)).toBe(full);
    const blocked = screen.getByRole('button', { name: 'Pack full' });
    expect(blocked).toBeDisabled();
    fireEvent.click(blocked);
    expect(onWithdrawStash).toHaveBeenCalledTimes(1);
  });

  it('uses fixed-level consumable previews for compatible stacking on later floors', () => {
    const game = town();
    game.dungeonLevel = 7;
    game.inventory.items.push(createVendorItem('health-herb'));
    const before = structuredClone(game);
    const onBuy = vi.fn();
    render(<TownVendor game={game} vendor="alchemist" title="Alchemist" onBuy={onBuy} />);
    const buy = screen.getByRole('button', { name: 'Buy 6g' });
    expect(buy).toBeEnabled();
    fireEvent.click(buy);
    expect(onBuy).toHaveBeenCalledExactlyOnceWith('alchemist', 'health-herb');
    const purchased = buyVendorItem(game, 'health-herb');
    expect(purchased).not.toBe(game);
    expect(purchased.inventory.items).toHaveLength(2);
    expect(purchased.inventory.items.find((item) => item.baseId === 'health-herb')?.quantity).toBe(2);
    expect(screen.getAllByText('Pack full').length).toBeGreaterThan(0);
    expect(game).toEqual(before);
  });

  it('admits a new purchase when only worn equipment occupies the ownership array', () => {
    const game = town();
    render(<TownVendor game={game} vendor="alchemist" title="Alchemist" onBuy={noop} />);
    expect(screen.getByRole('button', { name: 'Buy 6g' })).toBeEnabled();
    expect(canReceiveTownItem(game, createVendorItem('health-herb'))).toBe(true);
    expect(buyVendorItem(game, 'health-herb')).not.toBe(game);
  });

  it('never treats ambiguous worn records as free capacity or merges protected stacks', () => {
    const game = town();
    game.stash.items = [{ ...game.inventory.items[0] }];
    const { rerender } = render(<TownVendor game={game} vendor="alchemist" title="Alchemist" onBuy={noop} />);
    expect(canReceiveTownItem(game, createVendorItem('health-herb'))).toBe(false);
    expect(screen.getByRole('button', { name: 'Buy 6g' })).toBeDisabled();
    expect(buyVendorItem(game, 'health-herb')).toBe(game);
    const herb = createVendorItem('health-herb');
    game.inventory.items = [herb];
    game.stash.items = [{ ...herb }];
    rerender(<TownVendor game={game} vendor="alchemist" title="Alchemist" onBuy={noop} />);
    expect(canReceiveTownItem(game, createVendorItem('health-herb'))).toBe(false);
    expect(screen.getByRole('button', { name: 'Buy 6g' })).toBeDisabled();
    expect(buyVendorItem(game, 'health-herb')).toBe(game);
  });

  it('keeps stash capacity independent and protects equipped, locked, invalid and duplicate deposits', () => {
    const game = town();
    const spare = itemFixture({ id: 'spare', displayName: 'Spare Sword' });
    game.inventory.items.push(spare, itemFixture({ id: 'locked', locked: true }), itemFixture({ id: 'invalid', quantity: 0 }), itemFixture({ id: 'duplicate' }), itemFixture({ id: 'duplicate' }));
    const onStashItem = vi.fn();
    render(<TownStorage game={game} onSellJunk={noop} onWithdrawStash={noop} onStashItem={onStashItem} />);
    fireEvent.click(within(screen.getByRole('group', { name: 'Storage source' })).getByRole('button', { name: /^Pack / }));
    expect(canReceiveTownItem(game, spare, 'stash')).toBe(false);
    expect(stashItem(game, spare.id)).toBe(game);
    for (const name of ['Stash full', 'Equipped', 'Locked', 'Invalid stack quantity', 'Duplicate item identity']) {
      for (const button of screen.getAllByRole('button', { name })) {
        expect(button).toBeDisabled();
        fireEvent.click(button);
      }
    }
    expect(onStashItem).not.toHaveBeenCalled();
    expect(within(screen.getByRole('group', { name: 'Storage source' })).getByRole('button', { name: 'Pack 5/1' })).toBeVisible();
  });
});
