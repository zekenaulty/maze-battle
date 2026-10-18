import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgenticPlayDialog, type AgenticPlayDialogProps } from './AgenticPlayDialog';

const profile: NonNullable<AgenticPlayDialogProps['profile']> = {
  endpoint: 'wss://agentica.example.test/api/host',
  provider: { provider: 'openai', model: 'configured-model', contextWindowTokens: 8192, maxOutputTokens: 1024 },
  limits: { maxSteps: 12, maxRefinements: 2, maxPlanContinuations: 3, timeoutSeconds: 90, actionTimeoutSeconds: 15 },
};
let props: AgenticPlayDialogProps;
const mount = () => render(<AgenticPlayDialog {...props} />);
const objective = (value: string) => fireEvent.change(screen.getByRole('textbox', { name: 'Objective' }), { target: { value } });
const start = () => screen.getByRole('button', { name: 'Start Agentic play' });
const stop = () => screen.getByRole('button', { name: 'Stop Agentic play' });
beforeEach(() => {
  props = { profile: structuredClone(profile), phase: 'Ready', active: false, canStart: true,
    onStart: vi.fn(), onStop: vi.fn(), onRecovery: vi.fn(), onClose: vi.fn() };
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Dialog attempted network access'); }));
  vi.stubGlobal('WebSocket', vi.fn(() => { throw new Error('Dialog attempted transport creation'); }));
});
afterEach(() => {
  cleanup(); expect(fetch).not.toHaveBeenCalled(); expect(WebSocket).not.toHaveBeenCalled(); vi.unstubAllGlobals();
});

describe('explicit Agentic play controls', () => {
  it('opens with no objective or automatic callbacks, including rerender and unmount', () => {
    const view = mount();
    expect(screen.getByRole('dialog', { name: 'Agentic play' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Objective' })).toHaveValue('');
    expect(start()).toBeDisabled(); expect(stop()).toBeDisabled();
    view.rerender(<AgenticPlayDialog {...props} phase="Preparing" message="Preparation retained." />); view.unmount();
    for (const callback of [props.onStart, props.onStop, props.onRecovery, props.onClose]) expect(callback).not.toHaveBeenCalled();
  });
  it('starts only on an explicit click with the trimmed user objective', () => {
    mount(); objective('  Explore the known western passage.\n  ');
    expect(start()).toBeEnabled(); expect(props.onStart).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Objective' }), { key: 'Enter', ctrlKey: true });
    expect(props.onStart).not.toHaveBeenCalled(); fireEvent.click(start());
    expect(props.onStart).toHaveBeenCalledExactlyOnceWith('Explore the known western passage.');
    expect(props.onStop).not.toHaveBeenCalled(); expect(props.onRecovery).not.toHaveBeenCalled();
  });
  it.each(['', ' \n\t ', 'x'.repeat(513)])('refuses a blank or oversized objective (%#)', value => {
    mount(); objective(value); expect(start()).toBeDisabled(); fireEvent.click(start()); expect(props.onStart).not.toHaveBeenCalled();
  });
  it('matches the current 512-character launch validator boundary', () => {
    mount(); expect(screen.getByRole('textbox', { name: 'Objective' })).toHaveAttribute('maxlength', '512');
    objective('x'.repeat(512)); expect(start()).toBeEnabled(); fireEvent.click(start());
    expect(props.onStart).toHaveBeenCalledExactlyOnceWith('x'.repeat(512));
  });
  it.each(['profile', 'configuration', 'permission', 'active'])('blocks Start when %s is unavailable', kind => {
    if (kind === 'profile') props.profile = undefined;
    if (kind === 'configuration') props.configurationError = 'Configuration was refused.';
    if (kind === 'permission') props.canStart = false;
    if (kind === 'active') props.active = true;
    mount(); objective('Investigate the visible corridor.'); expect(start()).toBeDisabled(); fireEvent.click(start());
    expect(props.onStart).not.toHaveBeenCalled();
  });
  it('uses updated parent permission without losing the objective or implicitly starting', () => {
    const view = mount(); objective('Investigate the visible corridor.');
    view.rerender(<AgenticPlayDialog {...props} canStart={false} />); expect(start()).toBeDisabled();
    view.rerender(<AgenticPlayDialog {...props} />); expect(start()).toBeEnabled(); expect(props.onStart).not.toHaveBeenCalled();
  });
  it.each(['Preparing', 'Connecting', 'Executing', 'Stopping', 'Failed'])('keeps Stop and close usable while active in phase %s', phase => {
    props = { ...props, phase, active: true, canStart: false, profile: undefined, configurationError: 'Profile unavailable.', error: 'Operation pending.' };
    mount(); expect(stop()).toBeEnabled(); expect(start()).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Objective' })).toBeDisabled();
    fireEvent.click(stop()); expect(props.onStop).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' })); expect(props.onClose).toHaveBeenCalledOnce();
    expect(props.onStart).not.toHaveBeenCalled(); expect(props.onStop).toHaveBeenCalledOnce();
  });
  it('closing or native dismissal of active play never calls Stop', () => {
    props.active = true; mount(); fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }));
    expect(props.onClose).toHaveBeenCalledTimes(2); expect(props.onStop).not.toHaveBeenCalled(); expect(props.onStart).not.toHaveBeenCalled();
  });
  it.each([false, true])('allows explicit recovery while active=%s without stopping or starting', active => {
    props = { ...props, active, canStart: false, configurationError: 'Unavailable' }; mount();
    const recovery = screen.getByRole('button', { name: 'Recovery' }); expect(recovery).toBeEnabled();
    fireEvent.click(recovery); expect(props.onRecovery).toHaveBeenCalledOnce();
    expect(props.onStart).not.toHaveBeenCalled(); expect(props.onStop).not.toHaveBeenCalled(); expect(props.onClose).not.toHaveBeenCalled();
  });
  it('renders the supplied configuration and all limits as read-only text', () => {
    mount();
    for (const text of [profile.endpoint, 'openai', 'configured-model', '12 steps / 2 refinements / 3 continuations',
      '90 s run / 15 s action', '8192 context / 1024 output']) expect(screen.getByText(text)).toBeVisible();
    expect(screen.getAllByRole('textbox')).toHaveLength(1); expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
  it('shows honest missing configuration/model states and separate runtime feedback', () => {
    props = { ...props, profile: undefined, phase: 'Unavailable', configurationError: 'No launch profile.', message: 'No active run.', error: 'Previous run failed.' };
    const view = mount(); expect(screen.getAllByText('Not configured').length).toBeGreaterThan(0);
    expect(screen.getByText('Unavailable')).toBeVisible(); expect(screen.getByText('No active run.')).toHaveAttribute('role', 'status');
    expect(screen.getAllByRole('alert').map(item => item.textContent)).toEqual(['No launch profile.', 'Previous run failed.']);
    view.rerender(<AgenticPlayDialog {...props} profile={{ ...profile, provider: { ...profile.provider, model: undefined } }} />);
    expect(screen.getByText('Not specified')).toBeVisible(); expect(start()).toBeDisabled();
  });
  it('preserves a long endpoint and long feedback without adding editable configuration', () => {
    const endpoint = `wss://agentica.example.test/${'retained-endpoint-'.repeat(20)}`, message = 'long-status-'.repeat(40);
    props = { ...props, profile: { ...profile, endpoint }, message }; mount();
    expect(screen.getByText(endpoint).tagName).toBe('DD'); expect(screen.getByText(message)).toHaveClass('agentic-detail');
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });
});

describe('explicit same-owner decision continuation control', () => {
  const continueButton = () => screen.getByRole('button', { name: 'Continue' });
  beforeEach(() => {
    props = { ...props, phase: 'decision', active: true, activeObjective: 'Investigate the visible corridor.',
      canStart: false, canContinue: true, onContinue: vi.fn() };
  });

  it('only forwards an explicit Continue click, preserving the active objective and other controls', () => {
    mount(); expect(continueButton()).toBeEnabled(); expect(start()).toBeDisabled(); expect(stop()).toBeEnabled();
    const field = screen.getByRole('textbox', { name: 'Objective' });
    expect(field).toHaveValue(props.activeObjective); expect(field).toBeDisabled();
    fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true }); expect(props.onContinue).not.toHaveBeenCalled();
    fireEvent.click(continueButton()); expect(props.onContinue).toHaveBeenCalledExactlyOnceWith();
    expect(field).toHaveValue(props.activeObjective);
    for (const callback of [props.onStart, props.onStop, props.onRecovery, props.onClose]) expect(callback).not.toHaveBeenCalled();
  });

  it.each(['idle', 'preparing', 'starting', 'running', 'navigating', 'stopping', 'stopped', 'recovery'])
    ('disables Continue in active nondecision phase %s even with stale permission', phase => {
      props.phase = phase; mount(); expect(continueButton()).toBeDisabled(); fireEvent.click(continueButton());
      expect(props.onContinue).not.toHaveBeenCalled(); expect(stop()).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Recovery' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Close dialog' })).toBeEnabled();
    });

  it.each([false, undefined])('requires explicit parent permission (%s)', canContinue => {
    props.canContinue = canContinue; mount(); expect(continueButton()).toBeDisabled(); fireEvent.click(continueButton());
    expect(props.onContinue).not.toHaveBeenCalled();
  });

  it('does not offer cold or inactive continuation despite a retained decision label', () => {
    props.active = false; mount(); expect(continueButton()).toBeDisabled(); fireEvent.click(continueButton());
    expect(props.onContinue).not.toHaveBeenCalled();
  });

  it('omits Continue when no callback is mounted, including legacy callers', () => {
    props.onContinue = undefined; const view = mount(); expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    view.rerender(<AgenticPlayDialog {...props} canContinue={undefined} />);
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument(); expect(stop()).toBeEnabled();
  });

  it('does not use launch configuration, Start permission or feedback as continuation authority', () => {
    props = { ...props, profile: undefined, configurationError: 'Launch configuration unavailable.', error: 'Retained feedback.' };
    mount(); expect(start()).toBeDisabled(); expect(continueButton()).toBeEnabled(); fireEvent.click(continueButton());
    expect(props.onContinue).toHaveBeenCalledOnce(); expect(props.onStart).not.toHaveBeenCalled();
  });

  it('never continues on opening, permission changes, rerender, dismissal or unmount', () => {
    const view = mount();
    view.rerender(<AgenticPlayDialog {...props} canContinue={false} />);
    view.rerender(<AgenticPlayDialog {...props} />); expect(continueButton()).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' })); view.unmount();
    expect(props.onClose).toHaveBeenCalledOnce(); expect(props.onContinue).not.toHaveBeenCalled(); expect(props.onStop).not.toHaveBeenCalled();
  });

  it('honors synchronous parent busy state before a second click without owning a permanent latch', () => {
    const view = mount();
    const onContinue = vi.fn(() => view.rerender(<AgenticPlayDialog {...props} onContinue={onContinue} phase="preparing" canContinue={false} />));
    view.rerender(<AgenticPlayDialog {...props} onContinue={onContinue} />);
    const button = continueButton(); fireEvent.click(button); fireEvent.click(button);
    expect(onContinue).toHaveBeenCalledOnce(); expect(continueButton()).toBeDisabled(); expect(stop()).toBeEnabled();
    expect(screen.getByRole('textbox', { name: 'Objective' })).toHaveValue(props.activeObjective);
    view.rerender(<AgenticPlayDialog {...props} onContinue={onContinue} />);
    expect(continueButton()).toBeEnabled(); expect(onContinue).toHaveBeenCalledOnce();
    fireEvent.click(continueButton()); expect(onContinue).toHaveBeenCalledTimes(2);
    fireEvent.click(stop()); fireEvent.click(screen.getByRole('button', { name: 'Recovery' }));
    expect(props.onStop).toHaveBeenCalledOnce(); expect(props.onRecovery).toHaveBeenCalledOnce(); expect(props.onStart).not.toHaveBeenCalled();
  });

  it('forwards separate click intents when permission is unchanged; parent serialization owns duplicate effects', () => {
    mount(); fireEvent.click(continueButton()); fireEvent.click(continueButton());
    expect(props.onContinue).toHaveBeenCalledTimes(2); expect(continueButton()).toBeEnabled();
    expect(screen.getByRole('textbox', { name: 'Objective' })).toHaveValue(props.activeObjective);
  });
});
