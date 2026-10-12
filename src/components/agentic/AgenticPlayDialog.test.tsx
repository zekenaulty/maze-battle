import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AgenticPlayDialog } from './AgenticPlayDialog';
import type { RpgAgenticaView } from '../../services/agentica/rpg/client';

afterEach(cleanup);
const props = () => ({ position: { floor: 2, row: 3, column: 4 }, entrance: { floor: 2, row: 0, column: 1 }, quests: [],
  view: { state: 'idle', connected: false, steps: 0, replans: 0 } as RpgAgenticaView,
  busy: false, canStop: false, controlled: true, endpoint: 'ws://127.0.0.1:5189/api/host',
  onEndpointChange: vi.fn(), onStart: vi.fn(), onReconnect: vi.fn(), onAdopt: vi.fn(), onStop: vi.fn(), onClose: vi.fn() });

describe('Agentic play dialog', () => {
  it('requires an owner-chosen quest and passes only its ID with the known entrance', () => {
    const callbacks = props(), quests = [
      { id: 'fetch-one', title: 'Recover cache', itemName: 'Guild Cache' },
      { id: 'fetch-two', title: 'Recover relic', itemName: 'Silver Relic' },
    ];
    render(<AgenticPlayDialog {...callbacks} quests={quests} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Retrieve quest item' }));
    expect(screen.queryByLabelText('Row (1-based)')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Recover relic - Silver Relic' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Accepted fetch quest' }), { target: { value: 'fetch-two' } });
    expect(callbacks.onStart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(callbacks.onStart).toHaveBeenCalledExactlyOnceWith(callbacks.endpoint, callbacks.entrance, 'quest', 'fetch-two');
    fireEvent.click(screen.getByRole('radio', { name: 'Explore' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(callbacks.onStart).toHaveBeenLastCalledWith(callbacks.endpoint, callbacks.position, 'exploration');
  });

  it('disables unavailable quests and never submits a retained ineligible selection', () => {
    const callbacks = props();
    render(<AgenticPlayDialog {...callbacks} view={{ ...callbacks.view, mode: 'quest', questId: 'claimed' }} />);
    expect(screen.getByRole('radio', { name: 'Retrieve quest item' })).toBeDisabled();
    expect(screen.getByText('No accepted fetch quests on this floor.')).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Accepted fetch quest' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('button', { name: 'Start' }).closest('form')!);
    expect(callbacks.onStart).not.toHaveBeenCalled();
  });

  it('invalidates a removed quest without choosing another one on rerender', () => {
    const callbacks = props(), quests = [
      { id: 'one', title: 'First quest', itemName: 'First item' },
      { id: 'two', title: 'Second quest', itemName: 'Second item' },
    ];
    const view = { ...callbacks.view, mode: 'quest' as const, questId: 'one', target: callbacks.entrance };
    const { rerender } = render(<AgenticPlayDialog {...callbacks} quests={quests} view={view} />);
    expect(screen.getByRole('combobox')).toHaveValue('one');
    expect(screen.getByText('Entrance')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled();
    rerender(<AgenticPlayDialog {...callbacks} quests={[quests[1]]} view={view} />);
    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('button', { name: 'Start' }).closest('form')!);
    expect(callbacks.onStart).not.toHaveBeenCalled();
  });

  it.each([{ busy: true, controlled: true }, { busy: false, controlled: false }])
    ('blocks quest submission while busy=$busy, controlled=$controlled', guard => {
      const callbacks = props(), quests = [{ id: 'one', title: 'First quest', itemName: 'First item' }];
      render(<AgenticPlayDialog {...callbacks} {...guard} quests={quests} view={{ ...callbacks.view, mode: 'quest', questId: 'one' }} />);
      expect(screen.getByRole('combobox')).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
      fireEvent.submit(screen.getByRole('button', { name: 'Start' }).closest('form')!);
      expect(callbacks.onStart).not.toHaveBeenCalled();
    });

  it('explicit exploration starts from the actor without a supplied destination', () => {
    const callbacks = props(); render(<AgenticPlayDialog {...callbacks} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Explore' }));
    expect(screen.queryByLabelText('Row (1-based)')).not.toBeInTheDocument();
    expect(callbacks.onStart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(callbacks.onStart).toHaveBeenCalledWith(callbacks.endpoint, callbacks.position, 'exploration');
    fireEvent.click(screen.getByRole('radio', { name: 'Known destination' }));
    expect(screen.getByLabelText('Row (1-based)')).toBeVisible();
  });
  it('starts only on request with an explicit 1-based target converted to the current floor', () => {
    const callbacks = props();
    render(<AgenticPlayDialog {...callbacks} />);
    expect(callbacks.onStart).not.toHaveBeenCalled();
    expect(callbacks.onReconnect).not.toHaveBeenCalled();
    expect(callbacks.onAdopt).not.toHaveBeenCalled();
    expect(screen.getByText('Fixture provider')).toBeVisible();
    expect(screen.queryByText(/OpenAI|API key|hidden/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Row (1-based)'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Column (1-based)'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(callbacks.onStart).toHaveBeenCalledWith(callbacks.endpoint, { floor: 2, row: 8, column: 11 });
  });

  it.each(['', '0', '-1', '1.5'])('refuses an invalid target row %j', value => {
    const callbacks = props();
    render(<AgenticPlayDialog {...callbacks} />);
    fireEvent.change(screen.getByLabelText('Row (1-based)'), { target: { value } });
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(callbacks.onStart).not.toHaveBeenCalled();
  });

  it('reconnects without edited target values and displays the returned retained target', () => {
    const callbacks = props();
    const { rerender } = render(<AgenticPlayDialog {...callbacks} />);
    fireEvent.change(screen.getByLabelText('Row (1-based)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(callbacks.onReconnect).toHaveBeenCalledWith(callbacks.endpoint, callbacks.position);
    rerender(<AgenticPlayDialog {...callbacks} view={{ ...callbacks.view, state: 'paused', runId: 'retained-run',
      target: { floor: 7, row: 8, column: 9 }, steps: 12, replans: 2 }} />);
    expect(screen.getByText('Floor 7, row 9, column 10')).toBeVisible();
    expect(screen.getByText('12 / 2')).toBeVisible();
    expect(callbacks.onAdopt).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Adopt' }));
    expect(callbacks.onAdopt).toHaveBeenCalledOnce();
  });

  it('keeps Stop and Close enabled during a pending disconnected command or custody loss', () => {
    const callbacks = props();
    render(<AgenticPlayDialog {...callbacks} busy canStop controlled={false} error="Host unavailable" />);
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Host unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(callbacks.onStop).toHaveBeenCalledOnce();
    expect(callbacks.onClose).toHaveBeenCalledOnce();
  });
});
