import { AgenticaHost, type AgenticaHostOptions } from '../sdk/agentica-host.mjs';
import type { GameSession } from '../../game/GameSession';
import { readLaunch } from '../../../persistence/canonical/agentica/launch';
import { check } from '../../../persistence/canonical/validation';
import { prepareGameLaunch, type GameLaunchOptions } from './launch';
import { createGameTransport } from './transport';
import { transportGate } from './transportGate';
import { startPlayNavigation } from './playNavigation';
import { startPlayDecision, type PlayDecisionOriginal } from './playDecision';
import { stopGamePlay } from './playStop';

export interface GamePlayState {
  phase: 'idle' | 'preparing' | 'starting' | 'running' | 'navigating' | 'decision' | 'stopping' | 'stopped' | 'recovery';
  active: boolean; message?: string; error?: string; launchId?: string; objective?: string; canContinue?: boolean;
}
export const idleGamePlay: GamePlayState = { phase: 'idle', active: false };
type SdkFactory = (options: AgenticaHostOptions) => AgenticaHost;

/** Ephemeral ownership of existing canonical machinery, never a second persistent game or reconnect policy. */
export function createGamePlayController(session: GameSession, changed: (state: GamePlayState) => void,
  factory: SdkFactory = options => new AgenticaHost(options)) {
  const hostSignal = session.hostSignal;
  let state = { ...idleGamePlay }, closed = false, stopping = false, terminal = false;
  let gate: ReturnType<typeof transportGate> | undefined;
  let transport: Awaited<ReturnType<typeof createGameTransport>> | undefined;
  let navigation: Awaited<ReturnType<typeof startPlayNavigation>> | undefined;
  let decision: ReturnType<typeof startPlayDecision> | undefined, original: PlayDecisionOriginal | undefined;
  let remainingContinuations = 0;
  let pending: Promise<void> = Promise.resolve(), stopPending: Promise<void> | undefined;
  let attempt = 0, operationSeen = false, operationKey: string | undefined, releaseControl: (() => void) | undefined;
  const update = (patch: Partial<GamePlayState>) => {
    if (!closed && !hostSignal.aborted) {
      state = { ...state, ...patch };
      try { changed({ ...state }); } catch { /* Display observers never own action results. */ }
    }
  };
  const withdraw = () => { gate?.close(); navigation?.close(); transport?.close(); decision?.close(); };
  const fail = (error: unknown) => {
    if (closed || stopping || terminal || hostSignal.aborted) return;
    terminal = true; withdraw();
    update({ phase: 'recovery', active: true, canContinue: false, error: error instanceof Error ? error.message.slice(0, 240) : 'Agentic play requires recovery.' });
  };
  async function launch(config: GameLaunchOptions, launchId: string, token: number, localGate: ReturnType<typeof transportGate>) {
    const current = () => token === attempt && !closed && !stopping && !hostSignal.aborted;
    const report = (error: unknown) => { if (current()) fail(error); };
    let sdk: AgenticaHost;
    try {
      await session.flush(); localGate.signal.throwIfAborted();
      check(session.view.controlled && !session.view.busy && !session.view.recoveryRequired
        && session.view.game?.mode !== 'auto-play' && session.view.game?.mode !== 'town', 'Game control changed before preparation.');
      const previous = await readLaunch();
      localGate.signal.throwIfAborted();
      check(!previous.value || previous.value.guard.state === 'acknowledged', 'Recover the previous Agentic session before starting another.');
      await prepareGameLaunch(localGate.port, config, launchId); localGate.signal.throwIfAborted();
      update({ phase: 'starting', message: 'Starting Agentica' });
      const attached = await createGameTransport(localGate.port, launchId, hooks => {
        sdk = factory({ ...hooks,
          async onAction(action) {
            const result = await hooks.onAction(action);
            if (result.operation && current() && !terminal) {
              // Scheduling cannot change an already committed action result, including replay.
              try {
                const key = JSON.stringify([action.runId, action.actionId]);
                if (operationSeen) { check(operationKey === key, 'Another navigation requires recovery.'); return result; }
                operationSeen = true; operationKey = key;
                const launch = (await readLaunch(launchId)).value!; localGate.signal.throwIfAborted();
                check(launch.grant, 'Navigation lacks a committed launch grant.');
                const binding = { grant: launch.grant.ref, publication: launch.binding.publication };
                const driver = await startPlayNavigation(session, sdk, action, binding, localGate.signal,
                  status => {
                    if (!current()) return;
                    if (status.phase === 'decision') {
                      original = status.canContinue ? structuredClone({ action, binding }) : undefined;
                      terminal = true; transport?.close();
                    }
                    update({ ...status, canContinue: !!original && remainingContinuations > 0 });
                  }, report);
                if (!current() || localGate.signal.aborted) { driver.close(); return result; }
                navigation = driver;
                update({ phase: 'navigating', message: 'Awaiting service navigation custody' });
              } catch (error) { report(error); }
            }
            return result;
          },
          onStatus(status) {
            hooks.onStatus?.(status);
            if (status.state === 'action.error') report(new Error('Agentica action requires recovery.'));
          },
        }); return sdk;
      }, reason => {
        // A parked run closes its model channel. The separate driver still must prove exact HTTP custody before moving.
        if (reason === 'outcome' && operationSeen) return;
        report(new Error('Agentica channel ended. Host objective completion is not established; recovery is available.'));
      });
      if (!current() || localGate.signal.aborted) { attached.close(); return; }
      transport = attached;
      await attached.start(); localGate.signal.throwIfAborted();
      if (!operationSeen && !terminal) update({ phase: 'running', message: 'Agentica is choosing an action' });
    } catch (error) { report(error); }
  }
  function start(input: GameLaunchOptions) {
    check(!closed && !hostSignal.aborted && session.hostSignal === hostSignal && !state.active, 'Agentic play is already active or ownership changed.');
    check(session.view.controlled && !session.view.busy && !session.view.recoveryRequired && session.view.game
      && session.view.game.mode !== 'town' && session.view.game.mode !== 'auto-play', 'Start requires manual control of the current dungeon. Stop Auto first.');
    check(input.objective.trim().length > 0 && input.objective.length <= 512, 'Enter an objective of at most 512 characters.');
    const config = structuredClone(input), launchId = crypto.randomUUID();
    releaseControl = session.acquireAgenticControl();
    stopping = false; terminal = false; operationSeen = false; operationKey = undefined; stopPending = undefined;
    original = undefined; remainingContinuations = config.limits.maxPlanContinuations;
    gate = transportGate(session); update({ phase: 'preparing', active: true, launchId, objective: config.objective,
      error: undefined, canContinue: false, message: 'Preparing earned context' });
    pending = launch(config, launchId, ++attempt, gate); return pending;
  }
  function continueDecision() {
    check(!closed && !stopping && !hostSignal.aborted && session.hostSignal === hostSignal
      && state.active && state.phase === 'decision' && state.canContinue && original && releaseControl,
    'Continue requires the current owner and an explicit available decision.');
    const next = structuredClone(original);
    withdraw(); terminal = false; original = undefined; gate = transportGate(session);
    const token = ++attempt, localGate = gate;
    const current = () => token === attempt && !closed && !stopping && !hostSignal.aborted && !localGate.signal.aborted;
    // Advisory UI accounting only. Canonical intent/grant and service cumulative limits remain authoritative.
    remainingContinuations--;
    update({ phase: 'preparing', canContinue: false, error: undefined, message: 'Preparing the next explicit decision' });
    pending = (async () => {
      try {
        await session.flush(); if (!current()) return;
        check(session.view.controlled && !session.view.busy && !session.view.recoveryRequired,
          'Game control changed before continuation.');
        decision = startPlayDecision({ session, original: next, signal: localGate.signal, factory,
          update: status => { if (current()) update({ ...status, canContinue: false }); },
          onDecision: (candidate, status) => {
            if (!current()) return;
            original = structuredClone(candidate); terminal = true;
            update({ ...status, canContinue: remainingContinuations > 0 });
          },
          fail: error => { if (current()) fail(error); },
        });
      } catch (error) { if (current()) fail(error); }
    })();
    return pending;
  }
  function stop() {
    if (closed || !state.launchId) return Promise.resolve();
    if (stopPending) return stopPending;
    stopping = true; terminal = true; withdraw(); update({ phase: 'stopping', canContinue: false, message: 'Stopping local play', error: undefined });
    return stopPending = (async () => {
      try {
        const message = await stopGamePlay(session, state.launchId!, hostSignal);
        update({ phase: 'stopped', active: false, message });
      } catch (error) {
        update({ phase: 'recovery', active: false, error: String(error).slice(0, 240), message: 'Live execution withdrawn. Recovery is required.' });
      } finally { releaseControl?.(); releaseControl = undefined; }
    })();
  }
  const close = () => { if (closed) return; closed = true; stopping = true; terminal = true; withdraw(); releaseControl?.(); releaseControl = undefined; hostSignal.removeEventListener('abort', close); };
  hostSignal.addEventListener('abort', close, { once: true });
  return { start, continueDecision, stop, close, get state() { return { ...state }; } };
}
