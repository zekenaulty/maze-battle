import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { characterFixture, inventoryFixture, itemFixture } from '../../viewModels/characterTestFixtures';
import { DEFAULT_INVENTORY_FILTERS, projectInventory } from '../../viewModels/inventoryView';
import { InventoryItem } from './InventoryItem';
import { InventoryFilters } from './InventoryFilters';

afterEach(cleanup);

describe('inventory eligibility and score presentation', () => {
  const gear = itemFixture({ id: 'charm', slot: 'amulet', stats: { vitality: 5, maxHp: 7, intellect: 4 } });
  const actor = characterFixture({ hp: 100, mp: 20, equipment: { amulet: gear.id } });
  const herb = itemFixture({ id: 'herb', displayName: 'Health Herb', category: 'consumable', slot: undefined, stats: undefined, consumableEffect: 'heal', consumableAmount: 35 });
  const actions = () => ({ onUseItem: vi.fn(), onEquipItem: vi.fn() });

  it.each([
    ['heal', 'hp', 117, 'HP already full'],
    ['mana', 'mp', 28, 'MP already full'],
  ] as const)('uses the equipment-effective %s cap when base resources are already full', (effect, resource, maximum, reason) => {
    const potion = { ...herb, consumableEffect: effect };
    const inventory = inventoryFixture([gear, potion]);
    const row = projectInventory(inventory, [actor], actor, DEFAULT_INVENTORY_FILTERS).find((candidate) => candidate.item.id === potion.id)!;
    const props = { row, inventory, selectedActor: actor, ...actions() };
    const { rerender } = render(<InventoryItem {...props} />);
    const use = screen.getByRole('button', { name: 'Use' });
    expect(use).toBeEnabled();
    fireEvent.click(use);
    expect(props.onUseItem).toHaveBeenCalledWith(potion.id, actor.id);
    expect(actor[resource]).toBe(resource === 'hp' ? 100 : 20);

    rerender(<InventoryItem {...props} selectedActor={{ ...actor, [resource]: maximum }} />);
    expect(use).toBeDisabled();
    expect(use).toHaveAccessibleDescription(reason);
    expect(screen.getByText(reason)).toBeVisible();
  });

  it('rejects locked stacks and fallen potion targets without dispatching', () => {
    const inventory = inventoryFixture([gear, herb]);
    const row = projectInventory(inventory, [actor], actor, DEFAULT_INVENTORY_FILTERS).find((candidate) => candidate.item.id === herb.id)!;
    const props = { row, inventory, selectedActor: actor, ...actions() };
    const { rerender } = render(<InventoryItem {...props} row={{ ...row, item: { ...herb, locked: true } }} />);
    const use = screen.getByRole('button', { name: 'Use' });
    expect(use).toBeDisabled();
    expect(use).toHaveAccessibleDescription('Unlock before use');
    fireEvent.click(use);
    rerender(<InventoryItem {...props} selectedActor={{ ...actor, hp: 0 }} />);
    expect(use).toBeDisabled();
    expect(use).toHaveAccessibleDescription('Cannot use on a fallen character');
    fireEvent.click(use);
    expect(props.onUseItem).not.toHaveBeenCalled();
  });

  it('keeps a positive approximate score neutral and exposes the damage tradeoff without recommending it', () => {
    const equipped = itemFixture({ id: 'current', displayName: 'Current blade', stats: { baseDamage: 10 } });
    const candidate = itemFixture({ id: 'tradeoff', displayName: 'Tradeoff blade', stats: { baseDamage: 5, maxHp: 1, intellect: 300 } });
    const selected = { ...actor, equipment: { weapon: equipped.id } };
    const inventory = inventoryFixture([equipped, candidate]);
    const row = projectInventory(inventory, [selected], selected, DEFAULT_INVENTORY_FILTERS).find((entry) => entry.item.id === candidate.id)!;
    expect(row.comparison!.scoreDelta).toBeGreaterThan(0);
    render(<><InventoryItem row={row} inventory={inventory} selectedActor={selected} {...actions()} /><InventoryFilters filters={DEFAULT_INVENTORY_FILTERS} onChange={vi.fn()} /></>);
    expect(screen.getByText(/^Approx\. GS \+\d+$/)).not.toHaveClass('stat-positive');
    const deltas = within(screen.getByRole('list', { name: 'Effective stat changes' }));
    expect(deltas.getByText('-5 Base damage')).toBeVisible();
    expect(deltas.getByText('+1 Max HP')).toBeVisible();
    expect(screen.getByRole('article', { name: candidate.displayName })).not.toHaveTextContent(/upgrade|recommend/i);
    expect(screen.getByLabelText('Status')).toHaveTextContent('Higher GS');
    expect(screen.getByLabelText('Status')).not.toHaveTextContent(/upgrade/i);
  });
});
