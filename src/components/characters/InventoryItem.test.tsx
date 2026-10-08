import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { characterFixture, inventoryFixture, itemFixture } from '../../viewModels/characterTestFixtures';
import { DEFAULT_INVENTORY_FILTERS, projectInventory } from '../../viewModels/inventoryView';
import { InventoryItem } from './InventoryItem';
import { InventoryFilters } from './InventoryFilters';
import { combatDelta } from '../../viewModels/inventoryEvaluation';

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

  it('rejects a higher-GS damage tradeoff and displays authoritative combat deltas', () => {
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
    expect(screen.getByText('Not recommended')).toBeVisible();
    expect(screen.getByText(/Too much offense lost/)).toBeVisible();
    const combat = within(screen.getByRole('list', { name: 'Combat changes' }));
    expect(combat.getByText(`${combatDelta(row.comparison!.evaluation.deltas.offense)} Offense`)).toHaveClass('stat-negative');
    expect(combat.getByText('+1 Max HP')).toBeVisible();
    expect(combat.getByText('0 Useful MP')).toBeVisible();
    expect(screen.getByLabelText('Status')).toHaveTextContent('Recommended');
    expect(screen.getByLabelText('Sort')).toHaveTextContent('Recommendation');
  });

  it('shows useful MP gains for support skills and preserves explicit transfer ownership', () => {
    const candidate = itemFixture({ id: 'mana', stats: { maxMp: 10 } });
    const selected = { ...actor, skills: [{ id: 'heal' as const, cooldown: 0 }] };
    const owner = characterFixture({ id: 'ayla', displayName: 'Ayla', equipment: { weapon: candidate.id } });
    const inventory = inventoryFixture([candidate]);
    const [row] = projectInventory(inventory, [selected, owner], selected, DEFAULT_INVENTORY_FILTERS);
    render(<InventoryItem row={row} inventory={inventory} selectedActor={selected} {...actions()} />);
    expect(screen.getByText('Recommended')).toHaveClass('stat-positive');
    expect(screen.getByText(/Improves combat without losses/)).toBeVisible();
    expect(screen.getByText('For Vor vs empty weapon')).toBeVisible();
    expect(screen.getByText('Equipped: Ayla - weapon')).toBeVisible();
    expect(screen.getByText('+10 Useful MP')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Move' })).toHaveAttribute('title', 'Move from Ayla to Vor');
  });

  it('does not show protected baseline zeroes as actual combat changes', () => {
    const candidate = itemFixture({ id: 'locked', locked: true, stats: { baseDamage: 100 } });
    const inventory = inventoryFixture([candidate]);
    const [row] = projectInventory(inventory, [actor], actor, DEFAULT_INVENTORY_FILTERS);
    render(<InventoryItem row={row} inventory={inventory} selectedActor={actor} {...actions()} />);
    expect(screen.getByText('Protected')).toBeVisible();
    expect(screen.getByText(/Locked item/)).toBeVisible();
    expect(screen.getByText('Combat comparison unavailable')).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Combat changes' })).not.toBeInTheDocument();
  });
});
