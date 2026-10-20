import { AgenticaHost } from '../sdk/agentica-host.mjs';
import type { AgenticaAction } from '../contracts';
import type { GameSession } from '../../game/GameSession';
import { check } from '../../../persistence/canonical/validation';
import { equal, validateAction } from '../../../persistence/canonical/agentica/validation';
import { captureBinding, type ActionBinding } from './actionContract';
import { createGameDecisionController } from './decisionController';
import type { DecisionSdkFactory, DecisionWithdrawal } from './decisionChannel';
import type { DecisionSdk } from './decisionRemote';
import { publishGamePublication } from './publication';
import { startPlayNavigation, type PlayNavigationStatus } from './playNavigation';
import { deferred, transportGate } from './transportGate';
import { completionHooks, completionMessage } from './playCompletion';

export interface PlayDecisionOriginal { action: AgenticaAction; binding: ActionBinding }
export interface PlayDecisionStatus { phase: 'preparing' | 'starting' | 'running' | 'navigating' | 'decision' | 'satisfied'; message: string; canContinue?: boolean }
export interface PlayDecisionOptions {
  session: GameSession; original: PlayDecisionOriginal; signal: AbortSignal;
  update(status: PlayDecisionStatus): void;
  onDecision(original: PlayDecisionOriginal, status: PlayDecisionStatus & { phase: 'decision'; canContinue: true }): void;
  fail(error: unknown): void;
  factory?: DecisionSdkFactory;
  mode?: 'continue' | 'adopt';
}

/** One explicit continuation. No lease, root Stop, automatic next wake or retained UI journal. */
export function startPlayDecision(input: PlayDecisionOptions) {
  const { session, update: changed, onDecision, fail: failed, factory = options => new AgenticaHost(options) } = input;
  const mode = input.mode ?? 'continue';
  check(mode === 'continue' || mode === 'adopt', 'invalid decision mode');
  const hostSignal = session.hostSignal, scope = new AbortController();
  const signal = AbortSignal.any([hostSignal, input.signal, scope.signal]), gate = transportGate(session);
  const original = { action: validateAction(input.original.action), binding: captureBinding(input.original.binding) };
  const handoff = deferred<void>();
  let controller: Awaited<ReturnType<typeof createGameDecisionController>> | undefined;
  let navigation: Awaited<ReturnType<typeof startPlayNavigation>> | undefined, successor: PlayDecisionOriginal | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined, deadline: ReturnType<typeof setTimeout> | undefined;
  let closed = false, parked = false, acknowledged = false, completionSeen = false, satisfied = false;
  let deliveryUnconfirmed = false;
  const current = () => { if (session.hostSignal !== hostSignal) close(); return !closed && !signal.aborted; };
  const close = () => {
    if (closed) return; closed = true; clearTimeout(timer); clearTimeout(deadline);
    signal.removeEventListener('abort', close); navigation?.close(); controller?.close(); scope.abort(); gate.close(); handoff.reject(scope.signal.reason);
  };
  const update = (status: PlayDecisionStatus) => { if (current()) {
    try { changed({ ...status, canContinue: status.phase === 'decision' && status.canContinue === true }); }
    catch { /* Display observers do not own execution. */ }
  } };
  const fail = (error: unknown) => {
    if (!current() || satisfied) return; close();
    try { failed(error); } catch { /* Failure reporting cannot revive this runner. */ }
  };
  const completed = () => {
    satisfied = true;
    update({ phase: 'satisfied', message: completionMessage(parked, deliveryUnconfirmed) });
  };
  const withdraw = (reason: DecisionWithdrawal) => {
    if (!current()) return;
    // A committed operation may outlive the model socket, but still needs exact HTTP custody.
    if (completionSeen) {
      if (reason === 'outcome') parked = true; else deliveryUnconfirmed = true;
      if (satisfied) completed(); return;
    }
    if (reason === 'outcome' && successor) { parked = true; if (acknowledged) controller?.close(); return; }
    fail(new Error(`Decision channel ended (${reason}). Explicit recovery is required; objective completion is not established.`));
  };
  const navigationUpdate = (status: PlayNavigationStatus & { canContinue?: boolean }) => {
    if (!current() || completionSeen) return;
    update(status); if (status.phase !== 'decision' || !current()) return;
    const next = status.canContinue === true && successor ? structuredClone(successor) : undefined; close();
    if (next) { try { onDecision(next, { ...status, phase: 'decision', canContinue: true }); }
      catch (error) { try { failed(error); } catch { /* Already withdrawn. */ } } }
  };
  async function pulse() {
    if (!current()) return;
    try {
      const result = await controller!.pulse(); if (!current()) return;
      if (result.status === 'attached') {
        await controller!.acknowledge(); if (!current()) return;
        acknowledged = true; clearTimeout(deadline); handoff.resolve();
        if (parked && !completionSeen) controller!.close();
        if (!successor && !completionSeen) update({ phase: 'running', message: 'Agentica is choosing a successor action' });
        return;
      }
      check(result.status !== 'recovery-required' && result.status !== 'successor-settled', 'Decision continuation requires explicit recovery.');
      timer = setTimeout(() => { void pulse(); }, 250);
    } catch (error) { fail(error); }
  }
  async function start() {
    try {
      const attached = await createGameDecisionController(session, original.action, original.binding, {
        signal, sameOwnerOnly: mode === 'continue', adoptionOnly: mode === 'adopt', onWithdraw: withdraw,
        factory: originalHooks => {
          const hooks = completionHooks(originalHooks, async () => {
            if (!current()) return;
            completionSeen = true;
            // Fresh and retained completion replies both wait for the predecessor's exact ACK.
            try { await handoff.promise; if (current()) completed(); } catch (error) { fail(error); }
          });
          const sdk: DecisionSdk = factory({ ...hooks,
            async onAction(value) {
              const action = structuredClone(value), result = await hooks.onAction(action);
              if (result.operation && current() && !completionSeen) {
                try {
                  const binding = controller?.binding; check(binding, 'Successor operation requires an attached decision controller.');
                  if (successor) { check(equal(successor.action, action), 'Another successor operation requires recovery.'); return result; }
                  successor = { action: validateAction(action), binding: captureBinding(binding) };
                  await handoff.promise; if (!current()) return result;
                  const driver = await startPlayNavigation(session, sdk, successor.action, successor.binding, signal, navigationUpdate, fail);
                  if (!current()) { driver.close(); return result; }
                  navigation = driver; update({ phase: 'navigating', message: 'Awaiting successor operation custody' });
                } catch (error) { fail(error); }
              }
              return result;
            },
            onStatus(status) {
              hooks.onStatus?.(status);
              if (status.state === 'action.error' && current()) {
                if (completionSeen) { deliveryUnconfirmed = true; if (satisfied) completed(); }
                else fail(new Error('Successor action requires recovery.'));
              }
            },
          });
          return sdk;
        },
      });
      if (!current()) { attached.close(); return; } controller = attached;
      const publication = await publishGamePublication(gate.port); if (!current()) return;
      await controller.prepare(publication); if (!current()) return;
      update({ phase: 'starting', message: 'Continuing the retained decision' }); await pulse();
    } catch (error) { fail(error); }
  }
  signal.addEventListener('abort', close, { once: true });
  if (signal.aborted) close();
  else {
    deadline = setTimeout(() => fail(new Error('Decision attachment timed out. Explicit recovery is required.')), 15_000);
    update({ phase: 'preparing', message: 'Preparing current earned context' }); void start();
  }
  return { close };
}
