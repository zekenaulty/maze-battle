import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ItemInstance } from '../../domain/types';
import { characterFixture, inventoryFixture, itemFixture } from '../../viewModels/characterTestFixtures';
import { InventoryPanel } from './InventoryPanel';

afterEach(cleanup);
const herb = itemFixture({ id: 'herb', displayName: 'Health Herb', category: 'consumable', slot: undefined, quantity: 5, consumableEffect: 'heal', consumableAmount: 35 });

function setup(item = herb, equipped = false, duplicate = false) {
  const actor = characterFixture({ equipment: equipped ? { weapon: item.id } : {} });
  const onSellItem = vi.fn();
  const props = { inventory: inventoryFixture([item]), stash: { capacity: 96, items: duplicate ? [{ ...item }] : [] }, party: [actor], selectedActor: actor, slotFilter: 'all' as const, onSlotFilterChange: vi.fn(), onEquipItem: vi.fn(), onUseItem: vi.fn(), onAutoEquip: vi.fn(), onSellItem, canSellItems: true };
  return { props, ...render(<InventoryPanel {...props} />) };
}

describe('inventory sale integration', () => {
  it('offers sales only in town and hides consumable levels without hiding equipment levels', () => {
    const { props, rerender } = setup();
    expect(screen.getByRole('group', { name: 'Sell Health Herb' })).toBeVisible();
    expect(screen.getByRole('article', { name: 'Health Herb' })).not.toHaveTextContent(/\bLv\b/);
    fireEvent.click(screen.getByRole('button', { name: /^Sell One/ }));
    expect(props.onSellItem).toHaveBeenCalledWith(herb.id, 1);
    rerender(<InventoryPanel {...props} canSellItems={false} />);
    expect(screen.queryByRole('group', { name: 'Sell Health Herb' })).not.toBeInTheDocument();
    rerender(<InventoryPanel {...props} inventory={inventoryFixture([itemFixture()])} />);
    expect(screen.getByRole('article', { name: 'Iron Sword' })).toHaveTextContent('Lv 2');
  });

  it.each([
    { reason: 'Unlock before selling', item: { ...herb, locked: true } },
    { reason: 'Unequip before selling', item: herb, equipped: true },
    { reason: 'Not sellable', item: { ...herb, category: 'quest' as ItemInstance['category'] } },
    { reason: 'Duplicate item identity', item: herb, duplicate: true },
    { reason: 'Invalid sale value', item: { ...herb, value: NaN } },
  ])('disables every sale action: $reason', ({ item, reason, equipped, duplicate }) => {
    const { props } = setup(item, equipped, duplicate);
    const group = within(screen.getByRole('group', { name: 'Sell Health Herb' }));
    for (const button of group.getAllByRole('button')) {
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription(reason);
      fireEvent.click(button);
    }
    expect(group.getByRole('slider')).toBeDisabled();
    expect(group.getByText(reason)).toBeVisible();
    expect(props.onSellItem).not.toHaveBeenCalled();
  });
});
