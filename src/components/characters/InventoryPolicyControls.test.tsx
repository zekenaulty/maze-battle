import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import type { InventoryPolicy } from '../../domain/types';
import { DEFAULT_INVENTORY_POLICY } from '../../domain/items/inventoryPolicy';
import { rosterCommand } from '../../persistence/canonical/roster/commands';
import { TownPolicy } from '../screens/TownPolicy';
import { InventoryPolicyControls } from './InventoryPolicyControls';

afterEach(cleanup);

for (const surface of ['town', 'inventory'] as const) describe(`${surface} policy inputs`, () => {
  const policy = { ...DEFAULT_INVENTORY_POLICY };
  function setup() {
    const onChange = vi.fn();
    function Controlled() {
      const [current, setCurrent] = useState(policy);
      const change = (patch: Partial<InventoryPolicy>) => { onChange(patch); setCurrent(value => ({ ...value, ...patch })); };
      return surface === 'town' ? <TownPolicy policy={current} onChange={change} />
        : <InventoryPolicyControls policy={current} onChange={change} />;
    }
    render(<Controlled />);
    if (surface === 'inventory') fireEvent.click(screen.getByText('Inventory care'));
    expect(onChange).not.toHaveBeenCalled();
    return onChange;
  }

  it.each([
    ['healthReserve', 'Health reserve', 0, 20],
    ['manaReserve', 'Mana reserve', 0, 20],
    ['portalReserve', 'Portal reserve', 1, 5],
  ] as const)('%s dispatches only valid integer bounds without changing other policy fields', (key, label, min, max) => {
    const onChange = setup(), before = structuredClone(policy);
    const input = screen.getByRole('spinbutton', { name: label });
    for (const value of ['', '-1', String(min - 1), String(max + 1), '1.5', '1e309', '9007199254740992']) {
      fireEvent.change(input, { target: { value } });
      expect(onChange, `invalid input ${JSON.stringify(value)}`).not.toHaveBeenCalled();
      expect(input).toHaveValue(policy[key]);
    }
    expect(input).toHaveAttribute('min', String(min));
    expect(input).toHaveAttribute('max', String(max));
    expect(input).toHaveAttribute('step', '1');
    for (const value of [min, max]) {
      fireEvent.change(input, { target: { value: String(value === min ? max : min) } });
      onChange.mockClear();
      fireEvent.change(input, { target: { value: String(value) } });
      expect(onChange).toHaveBeenCalledExactlyOnceWith(surface === 'town' ? { ...policy, [key]: value } : { [key]: value });
      const [patch] = onChange.mock.calls[0];
      expect(() => rosterCommand({ kind: 'policy', patch })).not.toThrow();
      expect(input).toHaveValue(value);
    }
    expect(policy).toEqual(before);
  });

  it('only dispatches an explicitly changed toggle and preserves the callback shape', () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Auto equip' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(surface === 'town'
      ? { ...policy, autoEquip: false } : { autoEquip: false });
    expect(policy.autoEquip).toBe(true);
  });
});

it('keeps inventory policy controls disabled without a mutation callback', () => {
  render(<InventoryPolicyControls policy={DEFAULT_INVENTORY_POLICY} />);
  fireEvent.click(screen.getByText('Inventory care'));
  for (const input of [...screen.getAllByRole('spinbutton'), ...screen.getAllByRole('checkbox')]) expect(input).toBeDisabled();
});
