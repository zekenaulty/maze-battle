import type { GameSession } from '../../game/GameSession';
import type { AgenticaAction } from '../contracts';
import type { OperationSdk } from './operationTerminal';
import { createGameOperationDriver } from './operationDriver';
import type { ActionBinding } from './actionContract';

export interface PlayNavigationStatus { phase: 'navigating' | 'decision'; message: string; canContinue?: boolean }

/** One serialized engine pulse per timer. Service absence is bounded; errors never retry implicitly. */
export async function startPlayNavigation(session: GameSession, sdk: OperationSdk, action: AgenticaAction,
  binding: ActionBinding, signal: AbortSignal, update: (status: PlayNavigationStatus) => void, fail: (error: unknown) => void) {
  const driver = await createGameOperationDriver(session, sdk, action, binding);
  let timer: ReturnType<typeof setTimeout> | undefined, closed = false, lastProgress = Date.now();
  const close = () => { closed = true; clearTimeout(timer); driver.close(); signal.removeEventListener('abort', close); };
  signal.addEventListener('abort', close, { once: true });
  if (signal.aborted) { close(); signal.throwIfAborted(); }
  async function pulse() {
    try {
      if (closed) return;
      const result = await driver.pulse();
      if (closed || signal.aborted) return;
      if (result.status === 'decision-required' || result.status === 'terminal-acknowledged') {
        update({ phase: 'decision', canContinue: result.status === 'decision-required', message: result.status === 'decision-required'
          ? 'Navigation reached a decision boundary.' : 'Navigation settled. Objective completion is not established.' });
        close(); return;
      }
      if (result.status !== 'awaiting-service') lastProgress = Date.now();
      else if (Date.now() - lastProgress >= 15_000) throw new Error('Navigation custody is unavailable. Explicit recovery is required.');
      update({ phase: 'navigating', message: result.status === 'advanced' ? `Navigating: ${result.sequence} steps` : 'Confirming navigation custody' });
      timer = setTimeout(() => { void pulse(); }, 250);
    } catch (error) { close(); fail(error); }
  }
  timer = setTimeout(() => { void pulse(); }, 250);
  return { close };
}
