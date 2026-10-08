import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CharactersDialog, type CharactersDialogProps } from '../CharactersDialog';
import { characterFixture, inventoryFixture, itemFixture } from '../../viewModels/characterTestFixtures';

afterEach(() => { cleanup(); vi.useRealTimers(); });

function setup(overrides: Partial<CharactersDialogProps> = {}) {
  const item = itemFixture();
  const props: CharactersDialogProps = {
    party: [characterFixture({ equipment: { weapon: item.id } }), characterFixture({ id: 'zyth', displayName: 'Zyth', role: 'mage', equipment: {} })],
    inventory: inventoryFixture([item]),
    onClose: vi.fn(), onAutoBattleChange: vi.fn(), onEquipItem: vi.fn(), onUnequipItem: vi.fn(), onUseItem: vi.fn(), onAutoEquip: vi.fn(),
    onSellItem: vi.fn(), onStashItem: vi.fn(), onToggleItemLock: vi.fn(), onSpendAttribute: vi.fn(),
    canSellItems: true, canStashItems: true, ...overrides,
  };
  return { props, ...render(<CharactersDialog {...props} />) };
}

describe('CharactersDialog', () => {
  it('navigates characters and views by keyboard, preserves the selected target, and restores focus', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const { props, unmount } = setup();
    expect(screen.getByRole('button', { name: /Vor/ })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('button', { name: /Vor/ }), { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: /Zyth/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('table', { name: 'Zyth base and effective stats' })).toBeVisible();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Auto battle' }));
    expect(props.onAutoBattleChange).toHaveBeenCalledWith('zyth', false);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Stats' }), { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Inventory' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    expect(props.onEquipItem).toHaveBeenCalledWith('zyth', 'sword');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Inventory' }), { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledOnce();
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it('shows all eight slots and routes unequip/browse actions to the selected character', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Equipment' }));
    expect(screen.getAllByRole('button', { name: /^Browse / })).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: 'Unequip Iron Sword from Vor' }));
    expect(props.onUnequipItem).toHaveBeenCalledWith('vor', 'weapon');
    fireEvent.click(screen.getByRole('button', { name: 'Browse weapon' }));
    expect(screen.getByRole('tab', { name: 'Inventory' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Slot')).toHaveValue('weapon');
    expect(screen.getByRole('button', { name: 'Equipped' })).toBeDisabled();
  });

  it('guards equipped and locked items while allowing explicit lock changes', () => {
    const locked = itemFixture({ id: 'locked', displayName: 'Locked Sword', locked: true });
    const { props } = setup({ inventory: inventoryFixture([itemFixture(), locked]) });
    fireEvent.click(screen.getByRole('tab', { name: 'Inventory' }));
    for (const button of screen.getAllByRole('button', { name: /^Sell|^Stash/ })) {
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(props.onSellItem).not.toHaveBeenCalled();
    expect(props.onStashItem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Unlock Locked Sword' }));
    expect(props.onToggleItemLock).toHaveBeenCalledWith('locked');
  });

  it('filters and resets an empty result and passes consumables to the selected actor', () => {
    const herb = itemFixture({ id: 'herb', displayName: 'Health Herb', category: 'consumable', slot: undefined, stats: undefined, quantity: 2, consumableEffect: 'heal', consumableAmount: 35 });
    const { props } = setup({ inventory: inventoryFixture([itemFixture(), herb]) });
    fireEvent.click(screen.getByRole('tab', { name: 'Inventory' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'absent' } });
    expect(screen.getByText('No items match these filters.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reset inventory filters' }));
    expect(screen.getByRole('status')).toHaveTextContent('2 of 2 items');
    fireEvent.click(screen.getByText('Filters and sort'));
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'consumable' } });
    expect(screen.getByRole('status')).toHaveTextContent('1 of 2 items');
    fireEvent.click(screen.getByRole('button', { name: /Zyth/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Use' }));
    expect(props.onUseItem).toHaveBeenCalledWith('herb', 'zyth');
    expect(screen.getByRole('button', { name: 'Sell 15g' })).toBeEnabled();
  });

  it('sends minimal policy patches and attribute allocation without mutating props', () => {
    const policy = { autoEquip: true, autoSellJunk: false, autoStash: false, autoRestock: false, healthReserve: 2, manaReserve: 2, portalReserve: 1 };
    const onChange = vi.fn();
    const { props, rerender } = setup({ inventoryPolicy: policy, onInventoryPolicyChange: onChange });
    fireEvent.click(screen.getByRole('button', { name: 'Increase Strength' }));
    expect(props.onSpendAttribute).toHaveBeenCalledWith('vor', 'strength');
    fireEvent.click(screen.getByRole('tab', { name: 'Inventory' }));
    fireEvent.click(screen.getByText('Inventory care'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sell junk in town' }));
    expect(onChange).toHaveBeenLastCalledWith({ autoSellJunk: true });
    fireEvent.change(screen.getByLabelText('Health reserve'), { target: { value: '3.7' } });
    expect(onChange).toHaveBeenLastCalledWith({ healthReserve: 3 });
    expect(policy.healthReserve).toBe(2);
    rerender(<CharactersDialog {...props} party={[{ ...props.party[0], attributes: { ...props.party[0].attributes, available: 0 } }]} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Stats' }));
    expect(screen.getByRole('button', { name: 'Increase Strength' })).toBeDisabled();
  });

  it('updates cooldowns while visible and removes its timer when leaving Skills', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    setup({ party: [characterFixture({ skills: [{ id: 'slash', cooldown: 0, cooldownUntil: 2000 }] })] });
    fireEvent.click(screen.getByRole('tab', { name: 'Skills' }));
    expect(screen.getByText('Cooldown 1s')).toBeVisible();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText('Ready')).toBeVisible();
    expect(within(screen.getByRole('tabpanel')).getByText('0.75s')).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: 'Stats' }));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('tolerates an empty party and a removed selection', () => {
    const { props, rerender } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Zyth/ }));
    rerender(<CharactersDialog {...props} party={[props.party[0]]} />);
    expect(screen.getByRole('button', { name: /Vor/ })).toHaveAttribute('aria-pressed', 'true');
    rerender(<CharactersDialog {...props} party={[]} />);
    expect(screen.getByText('No characters in this party.')).toBeVisible();
  });
});
