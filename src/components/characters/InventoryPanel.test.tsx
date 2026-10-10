import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { characterFixture, inventoryFixture, itemFixture } from '../../viewModels/characterTestFixtures';
import { InventoryPanel } from './InventoryPanel';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('duplicate inventory records', () => {
  it.each([false, true])('retains both records without key warnings (equipped: %s)', (equipped) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const first = itemFixture({ id: 'duplicate', displayName: 'First blade', value: 1 });
    const second = itemFixture({ id: 'duplicate', displayName: 'Second blade', value: 100 });
    const inventory = inventoryFixture([first, second]);
    const actor = characterFixture({ equipment: equipped ? { weapon: first.id } : {} });
    const onEquipItem = vi.fn();
    render(<InventoryPanel inventory={inventory} party={[actor]} selectedActor={actor} slotFilter="all" onSlotFilterChange={vi.fn()} onEquipItem={onEquipItem} onUseItem={vi.fn()} onAutoEquip={vi.fn()} />);
    const firstRow = screen.getByRole('article', { name: first.displayName });
    const secondRow = screen.getByRole('article', { name: second.displayName });
    for (const row of [firstRow, secondRow]) {
      expect(within(row).getByText('Protected')).toBeVisible();
      for (const reason of within(row).getAllByText(/Duplicate item identity/)) expect(reason).toBeVisible();
      expect(within(row).queryByRole('list', { name: 'Combat changes' })).not.toBeInTheDocument();
      expect(within(row).queryByText(/^Approx\. GS [+-]?\d+$/)).not.toBeInTheDocument();
      const button = within(row).getByRole('button', { name: equipped ? 'Equipped' : 'Equip' });
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription('Duplicate item identity');
      fireEvent.click(button);
    }
    expect(onEquipItem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Filters and sort'));
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'value' } });
    expect(screen.getAllByRole('article')).toEqual([secondRow, firstRow]);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Second' } });
    expect(screen.getAllByRole('article')).toEqual([secondRow]);
    fireEvent.click(screen.getByRole('button', { name: 'Reset inventory filters' }));
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getByRole('article', { name: second.displayName })).toBe(secondRow);
    expect(inventory.items).toEqual([first, second]);
    expect(errors).not.toHaveBeenCalled();
  });
});
