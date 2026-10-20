import { AgenticaHost, type AgenticaHostOptions } from '../sdk/agentica-host.mjs';
import type { GameSession } from '../../game/GameSession';
import { readLaunch } from '../../../persistence/canonical/agentica/launch';
import { check } from '../../../persistence/canonical/validation';
import { equal } from '../../../persistence/canonical/agentica/validation';
import { prepareGameLaunch, type GameLaunchOptions } from './launch';
import { createGameTransport } from './transport';
import { transportGate } from './transportGate';
import { startPlayNavigation, type PlayNavigationStatus } from './playNavigation';
import { startPlayDecision, type PlayDecisionOriginal } from './playDecision';
import { inspectPlayAdoption, type PlayAdoptionOffer } from './playAdoption';
import { readPlayDecisionAllowance } from './playAllowance';
import { stopGamePlay } from './playStop';

export interface GamePlayState {
  phase: 'idle' | 'preparing' | 'starting' | 'running' | 'navigating' | 'decision' | 'stopping' | 'stopped' | 'recovery';
  active: boolean; message?: string; error?: string; launchId?: string; objective?: string; canContinue?: boolean;
  profile?: Pick<GameLaunchOptions, 'endpoint' | 'provider' | 'limits'>;
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
  function boundary(candidate: PlayDecisionOriginal | undefined, status: PlayNavigationStatus,
    current: () => boolean, signal: AbortSignal) {
    if (!current()) return;
    original = candidate && structuredClone(candidate); terminal = true; transport?.close();
    update({ ...status, canContinue: false, message: original ? 'Checking retained execution allowance.' : status.message });
    if (original) void readPlayDecisionAllowance(session, original, { signal }).then(remaining => {
      if (current() && state.phase === 'decision') update({ canContinue: remaining > 0,
        message: remaining > 0 ? status.message : `${status.message} Execution allowance exhausted.` });
    }).catch(error => { if (current()) { terminal = false; fail(error); } });
  }
  function mountDecision(next: PlayDecisionOriginal, mode: 'continue' | 'adopt', current: () => boolean, signal: AbortSignal) {
    decision = startPlayDecision({ session, original: next, mode, signal, factory,
      update: status => { if (current()) update({ ...status, canContinue: false }); },
      onDecision: (candidate, status) => boundary(candidate, status, current, signal),
      fail: error => { if (current()) fail(error); },
    });
  }
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
                if (operationSeen) { check(operationKey === key, 'Another operation requires recovery.'); return result; }
                operationSeen = true; operationKey = key;
                const launch = (await readLaunch(launchId)).value!; localGate.signal.throwIfAborted();
                check(launch.grant, 'Navigation lacks a committed launch grant.');
                const binding = { grant: launch.grant.ref, publication: launch.binding.publication };
                const driver = await startPlayNavigation(session, sdk, action, binding, localGate.signal,
                  status => {
                    if (!current()) return;
                    if (status.phase === 'decision') {
                      boundary(status.canContinue ? { action, binding } : undefined, status, current, localGate.signal);
                    } else update({ ...status, canContinue: false });
                  }, report);
                if (!current() || localGate.signal.aborted) { driver.close(); return result; }
                navigation = driver;
                update({ phase: 'navigating', message: 'Awaiting service operation custody' });
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
    original = undefined;
    gate = transportGate(session); update({ phase: 'preparing', active: true, launchId, objective: config.objective,
      profile: undefined, error: undefined, canContinue: false, message: 'Preparing earned context' });
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
    update({ phase: 'preparing', canContinue: false, error: undefined, message: 'Preparing the next explicit decision' });
    pending = (async () => {
      try {
        await session.flush(); if (!current()) return;
        check(session.view.controlled && !session.view.busy && !session.view.recoveryRequired,
          'Game control changed before continuation.');
        mountDecision(next, 'continue', current, localGate.signal);
      } catch (error) { if (current()) fail(error); }
    })();
    return pending;
  }
  function adoptDecision(input: PlayAdoptionOffer) {
    check(!closed && !hostSignal.aborted && session.hostSignal === hostSignal && !state.active,
      'Adoption requires inactive Agentic play and current ownership.');
    check(session.view.controlled && !session.view.busy && !session.view.recoveryRequired && session.view.game
      && session.view.game.mode !== 'town' && session.view.game.mode !== 'auto-play', 'Adoption requires manual control of the current dungeon.');
    const offered = structuredClone(input);
    releaseControl = session.acquireAgenticControl();
    stopping = false; terminal = false; stopPending = undefined; original = undefined;
    gate = transportGate(session); const localGate = gate, token = ++attempt;
    const current = () => token === attempt && !closed && !stopping && !hostSignal.aborted && !localGate.signal.aborted;
    update({ phase: 'preparing', active: true, launchId: undefined, objective: undefined, profile: undefined,
      canContinue: false, error: undefined, message: 'Revalidating inspected adoption' });
    pending = (async () => {
      try {
        await session.flush(); if (!current()) return;
        const checked = await inspectPlayAdoption(session, offered.fence, offered.candidate, { signal: localGate.signal });
        if (!current()) return;
        check(checked && equal(checked, offered), 'Adoption selection changed. Inspect the original again.');
        update({ launchId: checked.launchId, objective: checked.objective, profile: checked.profile });
        mountDecision(checked.original, 'adopt', current, localGate.signal);
      } catch (error) { if (current()) fail(error); }
    })();
    return pending;
  }
  function stop() {
    if (closed || !state.active && !state.launchId) return Promise.resolve();
    if (stopPending) return stopPending;
    stopping = true; terminal = true; withdraw(); update({ phase: 'stopping', canContinue: false, message: 'Stopping local play', error: undefined });
    return stopPending = (async () => {
      try {
        const message = state.launchId ? await stopGamePlay(session, state.launchId, hostSignal)
          : 'Local play stopped before adoption. The original remains available in recovery.';
        update({ phase: 'stopped', active: false, message });
      } catch (error) {
        update({ phase: 'recovery', active: false, error: String(error).slice(0, 240), message: 'Live execution withdrawn. Recovery is required.' });
      } finally { releaseControl?.(); releaseControl = undefined; }
    })();
  }
  const close = () => { if (closed) return; closed = true; stopping = true; terminal = true; withdraw(); releaseControl?.(); releaseControl = undefined; hostSignal.removeEventListener('abort', close); };
  hostSignal.addEventListener('abort', close, { once: true });
  return { start, continueDecision, adoptDecision, stop, close, get state() { return { ...state }; } };
}
