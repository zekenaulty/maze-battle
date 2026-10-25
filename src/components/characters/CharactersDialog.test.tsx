import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CharactersDialog, type CharactersDialogProps } from '../CharactersDialog';
import { characterFixture, inventoryFixture, itemFixture } from '../../viewModels/characterTestFixtures';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

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
  it('navigates characters and views by keyboard, preserves the selected target, and restores focus', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const { props, rerender, unmount } = setup();
    await waitFor(() => expect(screen.getByRole('button', { name: /Vor/ })).toHaveFocus());
    fireEvent.keyDown(screen.getByRole('button', { name: /Vor/ }), { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: /Zyth/ })).toHaveAttribute('aria-pressed', 'true');
    rerender(<CharactersDialog {...props} />);
    expect(screen.getByRole('button', { name: /Zyth/ })).toHaveFocus();
    expect(screen.getByRole('table', { name: 'Zyth base and effective stats' })).toBeVisible();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Auto battle' }));
    expect(props.onAutoBattleChange).toHaveBeenCalledWith('zyth', false);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Stats' }), { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Inventory' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    expect(props.onEquipItem).toHaveBeenCalledWith('zyth', 'sword');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Inventory' }), { key: 'Escape' });
    expect(props.onClose).not.toHaveBeenCalled();
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: false, cancelable: true }));
    expect(props.onClose).toHaveBeenCalledOnce();
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it('cancels pending autofocus on unmount instead of stealing restored focus', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const { unmount } = setup();
    unmount();
    await act(async () => { await Promise.resolve(); });
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it('focuses the shared close button when the party is empty', async () => {
    setup({ party: [] });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus());
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

  it('shows bag-only capacity and accessible full-pack reasons without blocking replacement gear', () => {
    const worn = itemFixture();
    const other = itemFixture({ id: 'other', displayName: 'Other Sword' });
    const spare = itemFixture({ id: 'spare', displayName: 'Spare Sword' });
    const { props, rerender } = setup({
      party: [characterFixture({ equipment: { weapon: worn.id } }), characterFixture({ id: 'zyth', displayName: 'Zyth', equipment: { weapon: other.id } })],
      inventory: { ...inventoryFixture([worn, other, spare]), capacity: 1 },
      stash: { capacity: 0, items: [] },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Equipment' }));
    const unequip = screen.getByRole('button', { name: 'Unequip Iron Sword from Vor' });
    expect(unequip).toBeDisabled();
    expect(unequip).toHaveAccessibleDescription('Pack full: no room to unequip');
    expect(screen.getByText('Pack full: no room to unequip')).toBeVisible();
    fireEvent.click(unequip);
    expect(props.onUnequipItem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Browse weapon' }));
    expect(screen.getByText(/Gold 35 - Pack 1\/1/)).toBeVisible();
    expect(screen.getByRole('status', { name: 'Inventory results' })).toHaveTextContent('3 of 3 items');
    const move = within(screen.getByRole('article', { name: 'Other Sword' })).getByRole('button', { name: 'Move' });
    expect(move).toBeDisabled();
    expect(move).toHaveAccessibleDescription('Pack full: no room for displaced gear');
    fireEvent.click(move);
    expect(props.onEquipItem).not.toHaveBeenCalled();
    const spareRow = within(screen.getByRole('article', { name: 'Spare Sword' }));
    const stash = spareRow.getByRole('button', { name: 'Stash' });
    expect(stash).toBeDisabled();
    expect(stash).toHaveAccessibleDescription('Stash full');
    fireEvent.click(stash);
    expect(props.onStashItem).not.toHaveBeenCalled();
    const equip = spareRow.getByRole('button', { name: 'Equip' });
    expect(equip).toBeEnabled();
    fireEvent.click(equip);
    expect(props.onEquipItem).toHaveBeenCalledWith('vor', 'spare');
    rerender(<CharactersDialog {...props} inventory={{ ...props.inventory, capacity: 2 }} stash={{ capacity: 1, items: [] }} />);
    expect(move).toBeEnabled();
    expect(stash).toBeEnabled();
    fireEvent.click(move);
    expect(props.onEquipItem).toHaveBeenLastCalledWith('vor', 'other');
    fireEvent.click(screen.getByRole('tab', { name: 'Equipment' }));
    expect(screen.getByRole('button', { name: 'Unequip Iron Sword from Vor' })).toBeEnabled();
  });

  it('filters and resets an empty result and passes consumables to the selected actor', () => {
    const herb = itemFixture({ id: 'herb', displayName: 'Health Herb', category: 'consumable', slot: undefined, stats: undefined, quantity: 2, consumableEffect: 'heal', consumableAmount: 35 });
    const { props } = setup({ inventory: inventoryFixture([itemFixture(), herb]) });
    fireEvent.click(screen.getByRole('tab', { name: 'Inventory' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'absent' } });
    expect(screen.getByText('No items match these filters.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reset inventory filters' }));
    expect(screen.getByRole('status', { name: 'Inventory results' })).toHaveTextContent('2 of 2 items');
    fireEvent.click(screen.getByText('Filters and sort'));
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'consumable' } });
    expect(screen.getByRole('status', { name: 'Inventory results' })).toHaveTextContent('1 of 2 items');
    fireEvent.click(screen.getByRole('button', { name: /Zyth/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Use' }));
    expect(props.onUseItem).toHaveBeenCalledWith('herb', 'zyth');
    expect(screen.getByRole('button', { name: 'Sell One 15g' })).toBeEnabled();
  });

  it('filters authoritative recommendations for the selected actor and includes stash identities', () => {
    const strength = itemFixture({ id: 'strength', displayName: 'Strength blade', stats: { strength: 20 } });
    const intellect = itemFixture({ id: 'intellect', displayName: 'Intellect wand', stats: { intellect: 20 } });
    const vor = characterFixture();
    const mage = characterFixture({ id: 'zyth', displayName: 'Zyth', role: 'mage', combat: { baseDamage: 10, scaleWith: 'intellect' }, skills: [{ id: 'wand', cooldown: 0 }] });
    const { props, rerender } = setup({ party: [vor, mage], inventory: inventoryFixture([strength, intellect]) });
    fireEvent.click(screen.getByRole('tab', { name: 'Inventory' }));
    fireEvent.click(screen.getByText('Filters and sort'));
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'upgrades' } });
    expect(screen.getByRole('article', { name: strength.displayName })).toBeVisible();
    expect(screen.queryByRole('article', { name: intellect.displayName })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Zyth/ }));
    expect(screen.getByRole('article', { name: intellect.displayName })).toBeVisible();
    expect(screen.queryByRole('article', { name: strength.displayName })).not.toBeInTheDocument();
    rerender(<CharactersDialog {...props} stash={{ capacity: 96, items: [{ ...intellect }] }} />);
    expect(screen.getByText('No items match these filters.')).toBeVisible();
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
    onChange.mockClear();
    fireEvent.change(screen.getByLabelText('Health reserve'), { target: { value: '3.7' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Health reserve'), { target: { value: '3' } });
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

  it('defaults auto-spend on and sends selected-actor changes even with no available points', () => {
    const vor = characterFixture({ attributes: { strength: 12, vitality: 8, intellect: 5, available: 0 } });
    const mage = { ...characterFixture({ id: 'zyth', displayName: 'Zyth', role: 'mage' }), autoSpendPoints: false };
    const onAutoSpendChange = vi.fn();
    const { props, rerender } = setup({ party: [vor, mage], onAutoSpendChange });
    const toggle = screen.getByRole('checkbox', { name: 'Auto-spend points' });
    expect(toggle).toBeChecked();
    expect(toggle).toBeEnabled();
    fireEvent.click(toggle);
    expect(onAutoSpendChange).toHaveBeenLastCalledWith('vor', false);
    expect(toggle).toBeChecked();
    expect(vor).not.toHaveProperty('autoSpendPoints');

    const manualVor = { ...vor, autoSpendPoints: false };
    rerender(<CharactersDialog {...props} party={[manualVor, mage]} />);
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(onAutoSpendChange).toHaveBeenLastCalledWith('vor', true);
    fireEvent.click(screen.getByRole('button', { name: /Zyth/ }));
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(onAutoSpendChange).toHaveBeenLastCalledWith('zyth', true);
    expect(mage.autoSpendPoints).toBe(false);
  });

  it('omits auto-spend controls when the host has not provided a mutation callback', () => {
    setup();
    expect(screen.queryByRole('checkbox', { name: 'Auto-spend points' })).not.toBeInTheDocument();
  });

  it('tolerates an empty party and a removed selection', () => {
    const { props, rerender } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Zyth/ }));
    rerender(<CharactersDialog {...props} party={[props.party[0]]} />);
    expect(screen.getByRole('button', { name: /Vor/ })).toHaveAttribute('aria-pressed', 'true');
    rerender(<CharactersDialog {...props} party={[]} />);
    expect(screen.getByText('No characters in this party.')).toBeVisible();
  });

  it('casts the four exploration skills for the selected caster without supplying a target or using inventory', () => {
    const healer = characterFixture({ id: 'ayla', displayName: 'Ayla', role: 'healer', mp: 50, maxMp: 60, skills: [{ id: 'heal', cooldown: 0 }, { id: 'groupHeal', cooldown: 0 }, { id: 'resurrect', cooldown: 0 }, { id: 'smite', cooldown: 0 }] });
    const mage = characterFixture({ id: 'zyth', displayName: 'Zyth', role: 'mage', mp: 50, maxMp: 60, skills: [{ id: 'teleport', cooldown: 0 }] });
    const onCastSkill = vi.fn();
    const { props } = setup({ party: [healer, mage, characterFixture({ hp: 0 })], onCastSkill, allowOutOfCombatSkills: true, now: 1000 });
    fireEvent.click(screen.getByRole('tab', { name: 'Skills' }));
    for (const name of ['Heal', 'Group Heal', 'Resurrect']) {
      const button = screen.getByRole('button', { name: `Cast ${name}` });
      expect(button).toBeEnabled();
      fireEvent.click(button);
    }
    expect(screen.queryByRole('button', { name: 'Cast Smite' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Zyth/ }));
    expect(screen.getByText(/random reachable tile in the current room or passage/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Cast Teleport' }));
    expect(onCastSkill.mock.calls).toEqual([['ayla', 'heal'], ['ayla', 'groupHeal'], ['ayla', 'resurrect'], ['zyth', 'teleport']]);
    expect(props.onUseItem).not.toHaveBeenCalled();
    expect(mage.mp).toBe(50);
  });

  it('blocks town teleport with an accessible reason without blocking healing or resurrection', () => {
    const healer = characterFixture({ id: 'ayla', displayName: 'Ayla', role: 'healer', mp: 50, maxMp: 60, skills: [{ id: 'heal', cooldown: 0 }, { id: 'groupHeal', cooldown: 0 }, { id: 'resurrect', cooldown: 0 }] });
    const mage = characterFixture({ id: 'zyth', displayName: 'Zyth', role: 'mage', mp: 50, maxMp: 60, skills: [{ id: 'teleport', cooldown: 0 }] });
    const onCastSkill = vi.fn();
    const { props, rerender } = setup({ party: [healer, mage, characterFixture({ hp: 0 })], onCastSkill, allowOutOfCombatSkills: true, allowTeleport: false, now: 1000 });
    fireEvent.click(screen.getByRole('tab', { name: 'Skills' }));
    for (const name of ['Heal', 'Group Heal', 'Resurrect']) {
      const button = screen.getByRole('button', { name: `Cast ${name}` });
      expect(button).toBeEnabled();
      fireEvent.click(button);
    }
    expect(onCastSkill.mock.calls).toEqual([['ayla', 'heal'], ['ayla', 'groupHeal'], ['ayla', 'resurrect']]);
    onCastSkill.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Zyth/ }));
    const teleport = screen.getByRole('button', { name: 'Cast Teleport' });
    expect(teleport).toBeDisabled();
    expect(teleport).toHaveAccessibleDescription('Dungeon only');
    expect(screen.getByText('Dungeon only')).toBeVisible();
    fireEvent.click(teleport);
    expect(onCastSkill).not.toHaveBeenCalled();
    rerender(<CharactersDialog {...props} allowTeleport />);
    expect(teleport).toBeEnabled();
    fireEvent.click(teleport);
    expect(onCastSkill).toHaveBeenCalledExactlyOnceWith('zyth', 'teleport');
    expect(props.onUseItem).not.toHaveBeenCalled();
  });

  it('shows an accessible reason and does not dispatch unavailable casts', () => {
    const healer = characterFixture({ skills: [{ id: 'heal', cooldown: 0 }] });
    const { props, rerender } = setup({ party: [healer], now: 1000, allowOutOfCombatSkills: true });
    fireEvent.click(screen.getByRole('tab', { name: 'Skills' }));
    const button = screen.getByRole('button', { name: 'Cast Heal' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Casting unavailable');
    const onCastSkill = vi.fn();
    rerender(<CharactersDialog {...props} onCastSkill={onCastSkill} allowOutOfCombatSkills={false} />);
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Outside combat only');
    fireEvent.click(button);
    rerender(<CharactersDialog {...props} onCastSkill={onCastSkill} party={[{ ...healer, mp: 0 }]} />);
    expect(button).toHaveAccessibleDescription('Needs 4 MP');
    fireEvent.click(button);
    expect(onCastSkill).not.toHaveBeenCalled();
  });

  it('uses controlled now without an interval and enables casting exactly at cooldown expiry', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const interval = vi.spyOn(window, 'setInterval');
    const healer = characterFixture({ skills: [{ id: 'heal', cooldown: 0, cooldownUntil: 2000 }] });
    const onCastSkill = vi.fn();
    const { props, rerender } = setup({ party: [healer], onCastSkill, allowOutOfCombatSkills: true, now: 1000 });
    fireEvent.click(screen.getByRole('tab', { name: 'Skills' }));
    expect(interval).not.toHaveBeenCalled();
    const button = screen.getByRole('button', { name: 'Cast Heal' });
    expect(button).toHaveAccessibleDescription('Cooldown 1s');
    act(() => vi.advanceTimersByTime(1000));
    expect(button).toBeDisabled();
    rerender(<CharactersDialog {...props} now={2000} />);
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onCastSkill).toHaveBeenCalledWith('vor', 'heal');
    rerender(<CharactersDialog {...props} now={undefined} />);
    expect(interval).toHaveBeenCalledOnce();
  });
});
