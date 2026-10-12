import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AgenticPlayDialog } from './AgenticPlayDialog';
import type { RpgAgenticaView } from '../../services/agentica/rpg/client';

afterEach(cleanup);
const props = () => ({ position: { floor: 2, row: 3, column: 4 },
  view: { state: 'idle', connected: false, steps: 0, replans: 0 } as RpgAgenticaView,
  busy: false, canStop: false, controlled: true, endpoint: 'ws://127.0.0.1:5189/api/host',
  onEndpointChange: vi.fn(), onStart: vi.fn(), onReconnect: vi.fn(), onAdopt: vi.fn(), onStop: vi.fn(), onClose: vi.fn() });

describe('Agentic play dialog', () => {
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
