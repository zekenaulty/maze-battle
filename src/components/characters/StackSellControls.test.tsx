import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { itemFixture } from '../../viewModels/characterTestFixtures';
import { StackSellControls } from './StackSellControls';

afterEach(cleanup);

const herb = itemFixture({ id: 'herb', displayName: 'Health Herb', category: 'consumable', slot: undefined, quantity: 5 });
const prices = [0, 4, 7, 11, 14, 18, 21, 25, 28];

describe('stack sale controls', () => {
  it('shows exact quotes for one, all and selected quantities without multiplying unit prices', () => {
    const getTotal = vi.fn((amount: number) => prices[amount]);
    const onSell = vi.fn();
    render(<StackSellControls item={herb} getTotal={getTotal} onSell={onSell} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sell One 4g' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sell All (5) 18g' }));
    const slider = screen.getByRole('slider', { name: 'Sell quantity for Health Herb' });
    expect(slider).toHaveAttribute('min', '1');
    expect(slider).toHaveAttribute('max', '5');
    expect(slider).toHaveAttribute('step', '1');
    fireEvent.change(slider, { target: { value: '3' } });
    expect(screen.getByText('3/5')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Sell 3 11g' }));
    expect(getTotal).toHaveBeenCalledWith(3);
    expect(onSell.mock.calls).toEqual([['herb', 1], ['herb', 5], ['herb', 3]]);
    expect(herb.quantity).toBe(5);
  });

  it('uses current rendered amounts after a stack shrinks or grows, and resets selection for a different item', () => {
    const onSell = vi.fn();
    const props = { item: herb, getTotal: (amount: number) => prices[amount], onSell };
    const { rerender } = render(<StackSellControls {...props} />);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '4' } });
    rerender(<StackSellControls {...props} item={{ ...herb, quantity: 2 }} />);
    expect(screen.getByRole('slider')).toHaveValue('2');
    fireEvent.click(screen.getByRole('button', { name: 'Sell All (2) 7g' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sell 2 7g' }));
    rerender(<StackSellControls {...props} item={{ ...herb, quantity: 8 }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sell All (8) 28g' }));
    rerender(<StackSellControls {...props} item={{ ...herb, id: 'other' }} />);
    expect(screen.getByRole('slider')).toHaveValue('1');
    fireEvent.click(screen.getByRole('button', { name: 'Sell One 4g' }));
    expect(onSell.mock.calls).toEqual([['herb', 2], ['herb', 2], ['herb', 8], ['other', 1]]);
  });

  it('shows only Sell One for a single item', () => {
    render(<StackSellControls item={{ ...herb, quantity: undefined }} getTotal={() => 4} onSell={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Sell One 4g' })).toBeEnabled();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid quantity %s without quoting or dispatching', (quantity) => {
    const getTotal = vi.fn(() => 4);
    const onSell = vi.fn();
    render(<StackSellControls item={{ ...herb, quantity }} getTotal={getTotal} onSell={onSell} />);
    const button = screen.getByRole('button', { name: 'Sell One' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Invalid stack quantity');
    fireEvent.click(button);
    expect(getTotal).not.toHaveBeenCalled();
    expect(onSell).not.toHaveBeenCalled();
  });

  it.each([NaN, Infinity, -1, 0, 1.5])('rejects invalid quote %s and exposes an accessible reason', (price) => {
    const onSell = vi.fn();
    render(<StackSellControls item={herb} getTotal={(amount) => amount === 5 ? price : 4} onSell={onSell} />);
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription('Invalid sale value');
      fireEvent.click(button);
    }
    expect(screen.getByRole('slider')).toBeDisabled();
    expect(onSell).not.toHaveBeenCalled();
  });
});
