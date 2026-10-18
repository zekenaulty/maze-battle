// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AgenticaAction, AgenticaResult } from '../contracts';
import type { AgenticaHost, AgenticaHostOptions, HostStartSubmission } from '../sdk/agentica-host.mjs';
import type { GameSession } from '../../game/GameSession';
import type { CanonicalHostCommand, CanonicalHostPort } from '../../game/CanonicalHostCommand';
import type { CanonicalRequest } from '../../../persistence/canonical/types';
import { launchEntryFixture, launchStartFixture, launchStartedFixture } from '../../../persistence/canonical/agentica/launch.test-support';
import { createGamePlayController, type GamePlayState } from './playController';
import type { GameLaunchOptions } from './launch';
import { deferred } from './transportGate';
import { mazeCapabilities } from './capabilities';

const m = vi.hoisted(() => ({ read: vi.fn(), prepare: vi.fn(), execute: vi.fn(), publication: vi.fn(),
  hooks: vi.fn(), action: vi.fn(), save: vi.fn(), load: vi.fn(), reconcile: vi.fn(), driver: vi.fn(), stop: vi.fn() }));
vi.mock('../../../persistence/canonical/agentica/launch', () => ({ readLaunch: m.read, executeLaunchCommand: m.execute }));
vi.mock('../../../persistence/canonical/agentica/publication', () => ({ assertPublicationCurrent: m.publication }));
vi.mock('./launch', () => ({ prepareGameLaunch: m.prepare }));
vi.mock('./actionHooks', () => ({ createGameActionHooks: m.hooks }));
vi.mock('./actionRead', () => ({ loadGameAction: m.load, reconcileGameAction: m.reconcile }));
vi.mock('./manifestDigest', () => ({ mazeManifestDigest: async () => `sha256:${'a'.repeat(64)}` }));
vi.mock('./operationDriver', () => ({ createGameOperationDriver: m.driver }));
vi.mock('./playStop', () => ({ stopGamePlay: m.stop }));

// Real controller, transport correlation/gates, wire validators and navigation timer. No database,
// WebSocket, HTTP, provider, or real operation driver: these are lifecycle tests, not custody proof.
const start = { ...launchStartFixture(), capabilities: mazeCapabilities() };
const config: GameLaunchOptions = { endpoint: 'ws://127.0.0.1:1/api/host', objectiveId: start.objectiveId,
  objective: start.objective, provider: start.provider, limits: start.limits };
const action: AgenticaAction = { actionId: 'navigation', runId: 'service-run', runnerRunId: 'runner', stepId: 'step',
  sessionId: start.sessionId, sessionEpoch: start.sessionEpoch, capabilityId: 'maze.navigate',
  manifestHash: `sha256:${'a'.repeat(64)}`, arguments: { level: 1, spaceId: 'room', row: 1, column: 1 }, expectedRevision: 1,
  deadlineAt: '2026-10-19T00:00:00.000Z' };
const result: AgenticaResult = { actionId: action.actionId, sessionId: action.sessionId, sessionEpoch: action.sessionEpoch,
  disposition: 'applied', beforeRevision: 1, afterRevision: 2, evidenceId: 'canonical-receipt', summary: 'Navigation admitted.',
  operation: { operationId: 'canonical-navigation', summary: 'Durable navigation.' } };
const ref = { key: 'fixture-key', id: 'immutable-version' };
const head = { owner: 'owner', epoch: 1 };
const prepared = (launchId: string) => ({ binding: { launchId, start, endpoint: config.endpoint, publication: ref },
  publication: {}, guard: { state: 'admitted', ...head },
  dispatch: null as null | { ref: typeof ref; source: { attemptId: string } },
  run: null as null | { ref: typeof ref }, grant: null as null | { ref: typeof ref } });
let retained: ReturnType<typeof prepared> | null;
let host: AbortController, options: AgenticaHostOptions, controller: ReturnType<typeof createGamePlayController>;
let committed: string[], changes: GamePlayState[];
let flush: Mock, releaseControl: Mock, acquire: Mock;
let connect: Mock, startDurable: Mock, sdkClose: Mock;
let pulse: Mock, driverClose: Mock, changed: Mock<(state: GamePlayState) => void>;
let session: GameSession;

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers();
  host = new AbortController(); retained = null; committed = []; changes = [];
  flush = vi.fn(async () => {}); releaseControl = vi.fn(); acquire = vi.fn(() => releaseControl);
  changed = vi.fn((state: GamePlayState) => { changes.push(state); });
  connect = vi.fn(async () => {}); sdkClose = vi.fn(() => { options.onStatus?.({ state: 'disconnected' }); });
  startDurable = vi.fn(async (submission: HostStartSubmission) => ({ ...launchStartedFixture(start),
    startAdmission: launchEntryFixture(start, submission.attemptId) }));
  pulse = vi.fn(async () => ({ status: 'awaiting-service' })); driverClose = vi.fn();
  m.driver.mockResolvedValue({ pulse, close: driverClose });
  m.read.mockImplementation(async () => ({ head, value: structuredClone(retained) }));
  m.execute.mockImplementation(async (request: CanonicalRequest, { signal }: { signal: AbortSignal }) => {
    signal.throwIfAborted(); committed.push(request.operation);
    if (request.operation === 'operation.admit') retained = prepared((request.input as { launchId: string }).launchId);
    if (request.operation === 'agentica.launch.dispatch') retained!.dispatch = { ref, source: { attemptId: 'start-attempt' } };
    if (request.operation === 'agentica.launch.announce') retained!.run = { ref };
    if (request.operation === 'agentica.launch.grant') retained!.grant = { ref };
    return { receipt: {} };
  });
  session = { get hostSignal() { return host.signal; }, flush, acquireAgenticControl: acquire,
    view: { controlled: true, busy: false, recoveryRequired: false, game: { mode: 'explore' } },
    async submitHostCommand(command: CanonicalHostCommand) {
      if (command.kind !== 'fresh') throw new Error('Unexpected retry');
      // Preserve execution-time gate checking while replacing canonical storage itself.
      return (await command.execute({ operation: command.operation, input: command.input } as CanonicalRequest,
        { signal: host.signal })).receipt;
    } } as unknown as GameSession;
  m.prepare.mockImplementation(async (port: CanonicalHostPort, _input: GameLaunchOptions, launchId: string) => {
    await port.submitHostCommand({ kind: 'fresh', operation: 'operation.admit', input: { launchId }, execute: m.execute });
  });
  m.action.mockResolvedValue(result);
  m.hooks.mockReturnValue({ onAction: m.action, saveAction: m.save, loadAction: m.load, reconcileAction: m.reconcile });
  m.stop.mockResolvedValue('Original root acknowledged.');
  controller = createGamePlayController(session, changed, hooks => {
    options = hooks;
    return { connect, startDurable, close: sdkClose } as unknown as AgenticaHost;
  });
});
afterEach(() => { controller.close(); vi.clearAllTimers(); vi.useRealTimers(); });

function notice(type: string, runId = action.runId, payload = {}) {
  options.onMessage?.({ protocolVersion: 1, type, runId, payload });
}
async function attached() {
  await controller.start(config);
  expect(controller.state.phase).toBe('running');
  expect(committed).toContain('agentica.launch.grant');
}
async function navigating() {
  await attached(); expect(await options.onAction(action)).toBe(result);
  expect(controller.state.phase).toBe('navigating'); expect(m.driver).toHaveBeenCalledTimes(1);
}
function hold(fn: Mock) {
  const entered = deferred<void>(), released = deferred<void>(), original = fn.getMockImplementation()!;
  fn.mockImplementationOnce(async (...args: unknown[]) => { entered.resolve(); await released.promise; return original(...args); });
  return { entered: entered.promise, release: () => released.resolve() };
}

describe('play controller lifetime and Stop barriers', () => {
  it('opening and closing the controller is inert', async () => {
    controller.close(); controller.close(); await controller.stop();
    expect(m.read).not.toHaveBeenCalled(); expect(m.prepare).not.toHaveBeenCalled(); expect(acquire).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled(); expect(m.stop).not.toHaveBeenCalled(); expect(host.signal.aborted).toBe(false);
  });

  it.each(['flush', 'initial read', 'prepare', 'connect', 'start reply'] as const)('Stop overtakes pending %s and fences its late continuation', async stage => {
    const target = { flush, 'initial read': m.read, prepare: m.prepare, connect, 'start reply': startDurable }[stage];
    const barrier = hold(target), startup = controller.start(config);
    await barrier.entered;
    let startupDone = false; void startup.then(() => { startupDone = true; });
    const before = [...committed], stopping = controller.stop();
    expect(controller.stop()).toBe(stopping);
    expect(m.stop).toHaveBeenCalledWith(session, controller.state.launchId, host.signal);
    await stopping;
    expect(startupDone).toBe(false); expect(host.signal.aborted).toBe(false);
    expect(controller.state.phase).toBe('stopped'); expect(releaseControl).toHaveBeenCalledTimes(1);
    barrier.release(); await startup;
    expect(committed).toEqual(before); expect(m.driver).not.toHaveBeenCalled();
    expect(controller.state.phase).toBe('stopped');
  });

  it.each(['operation.admit', 'agentica.launch.dispatch', 'agentica.launch.announce', 'agentica.launch.grant'])(
    'Stop before %s execution prevents the commit', async operation => {
      const entered = deferred<void>(), released = deferred<void>(), execute = m.execute.getMockImplementation()!;
      m.execute.mockImplementation(async (...args: unknown[]) => {
        if ((args[0] as CanonicalRequest).operation === operation) { entered.resolve(); await released.promise; }
        return execute(...args);
      });
      const startup = controller.start(config); await entered.promise; await controller.stop();
      released.resolve(); await startup;
      expect(committed).not.toContain(operation); expect(m.driver).not.toHaveBeenCalled();
      expect(controller.state.phase).toBe('stopped'); expect(host.signal.aborted).toBe(false);
    });

  it('closes a transport returned after Stop without ever connecting it', async () => {
    const entered = deferred<void>(), released = deferred<void>();
    m.read.mockImplementation(async (id?: string) => {
      const snapshot = { head, value: structuredClone(retained) };
      if (id) { entered.resolve(); await released.promise; }
      return snapshot;
    });
    const startup = controller.start(config); await entered.promise; await controller.stop();
    released.resolve(); await startup;
    expect(connect).not.toHaveBeenCalled(); expect(startDurable).not.toHaveBeenCalled();
    expect(sdkClose).toHaveBeenCalledTimes(1); expect(controller.state.phase).toBe('stopped');
  });

  it.each(['stop', 'close', 'host abort'])('closes a late navigation driver after %s and preserves the admitted result', async kind => {
    await attached(); const barrier = hold(m.driver), delivered = options.onAction(action);
    await barrier.entered;
    if (kind === 'stop') await controller.stop();
    else if (kind === 'close') controller.close();
    else host.abort(new Error('Owner takeover'));
    const updates = changes.length;
    barrier.release(); await expect(delivered).resolves.toBe(result);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(driverClose).toHaveBeenCalled(); expect(pulse).not.toHaveBeenCalled(); expect(changes).toHaveLength(updates);
    expect(releaseControl).toHaveBeenCalledTimes(1);
  });

  it('withdraws timers synchronously even when explicit Stop cleanup fails', async () => {
    await navigating(); m.stop.mockRejectedValue(new Error('HTTP unavailable'));
    const stopping = controller.stop(); expect(driverClose).toHaveBeenCalled();
    await stopping; await vi.advanceTimersByTimeAsync(30_000);
    expect(pulse).not.toHaveBeenCalled(); expect(host.signal.aborted).toBe(false);
    expect(controller.state).toMatchObject({ phase: 'recovery', active: false });
    expect(releaseControl).toHaveBeenCalledTimes(1);
  });

  it.each(['captured empty snapshot', 'fresh snapshot'])('an old start with a late %s cannot affect a replacement start', async mode => {
    const entered = deferred<void>(), released = deferred<void>(), read = m.read.getMockImplementation()!;
    m.read.mockImplementationOnce(async () => {
      const snapshot = await read(); entered.resolve(); await released.promise;
      return mode === 'captured empty snapshot' ? snapshot : read();
    });
    const oldStart = controller.start(config);
    await entered.promise; const oldId = controller.state.launchId;
    await controller.stop(); await controller.start(config);
    const newId = controller.state.launchId, before = m.prepare.mock.calls.length;
    expect(newId).not.toBe(oldId);
    released.resolve(); await oldStart;
    expect(m.prepare).toHaveBeenCalledTimes(before);
    expect(controller.state).toMatchObject({ phase: 'running', launchId: newId });
  });
});

describe('authoritative transport withdrawal', () => {
  it('unsolicited started and foreign terminal notices cannot mint a grant', async () => {
    const barrier = hold(startDurable), startup = controller.start(config); await barrier.entered;
    options.onMessage?.({ protocolVersion: 1, type: 'started', requestId: 'foreign-request',
      runId: 'foreign-run', payload: launchStartedFixture(start, 'foreign-run') });
    notice('outcome', 'unrelated-run');
    expect(committed).not.toContain('agentica.launch.announce'); expect(committed).not.toContain('agentica.launch.grant');
    expect(m.driver).not.toHaveBeenCalled();
    barrier.release(); await startup;
    expect(controller.state.phase).toBe('running');
    expect(m.execute.mock.calls.find(([r]) => r.operation === 'agentica.launch.announce')![0].input.started.runId).toBe('service-run');
  });

  it.each(['cancel.requested', 'cancelled', 'run.terminated', 'outcome'])('ignores foreign %s after attachment', async type => {
    await navigating(); notice(type, 'foreign-run');
    await vi.advanceTimersByTimeAsync(250);
    expect(pulse).toHaveBeenCalledTimes(1); expect(driverClose).not.toHaveBeenCalled();
    expect(sdkClose).not.toHaveBeenCalled(); expect(controller.state.phase).toBe('navigating');
  });

  it.each(['cancel.requested', 'cancelled', 'run.terminated'])('matching %s withdraws the driver without automatic cleanup', async type => {
    await navigating(); notice(type); await vi.advanceTimersByTimeAsync(30_000);
    expect(driverClose).toHaveBeenCalled(); expect(pulse).not.toHaveBeenCalled(); expect(sdkClose).toHaveBeenCalledTimes(1);
    expect(m.stop).not.toHaveBeenCalled(); expect(host.signal.aborted).toBe(false);
    expect(controller.state).toMatchObject({ phase: 'recovery', active: true });
  });

  it.each(['disconnected', 'connection.error', 'protocol.error', 'action.error'])('%s withdraws navigation', async state => {
    await navigating(); options.onStatus?.({ state }); await vi.advanceTimersByTimeAsync(1_000);
    expect(driverClose).toHaveBeenCalled(); expect(pulse).not.toHaveBeenCalled(); expect(controller.state.phase).toBe('recovery');
  });

  it('operation.parked then outcome keeps only the existing driver alive', async () => {
    await navigating(); notice('operation.parked'); expect(sdkClose).not.toHaveBeenCalled();
    notice('outcome');
    expect(sdkClose).toHaveBeenCalledTimes(1); expect(driverClose).not.toHaveBeenCalled();
    expect(controller.state.phase).toBe('navigating');
    await vi.advanceTimersByTimeAsync(250); expect(pulse).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1); expect(startDurable).toHaveBeenCalledTimes(1);
    await expect(options.onAction(action)).rejects.toThrow('disconnected');
    expect(m.action).toHaveBeenCalledTimes(1);
    await controller.stop(); expect(driverClose).toHaveBeenCalled(); expect(host.signal.aborted).toBe(false);
  });

  it('outcome without a canonical operation withdraws, even after an operation.parked notice', async () => {
    await attached(); notice('operation.parked'); notice('outcome');
    expect(controller.state.phase).toBe('recovery'); expect(m.driver).not.toHaveBeenCalled();
    expect(sdkClose).toHaveBeenCalledTimes(1); expect(m.stop).not.toHaveBeenCalled();
  });

  it('outcome after canonical admission permits a driver still being constructed', async () => {
    await attached(); const barrier = hold(m.driver), delivered = options.onAction(action);
    await barrier.entered; notice('outcome');
    barrier.release(); await expect(delivered).resolves.toBe(result);
    await vi.advanceTimersByTimeAsync(250);
    expect(pulse).toHaveBeenCalledTimes(1); expect(driverClose).not.toHaveBeenCalled();
    expect(controller.state.phase).toBe('navigating'); expect(sdkClose).toHaveBeenCalledTimes(1);
  });
});

describe('canonical callback and bounded navigation loop', () => {
  it('coalesces duplicate callbacks while the first driver is still being constructed', async () => {
    await attached(); const barrier = hold(m.driver), first = options.onAction(action);
    await barrier.entered;
    await expect(options.onAction(structuredClone(action))).resolves.toBe(result);
    expect(m.driver).toHaveBeenCalledTimes(1);
    barrier.release(); await expect(first).resolves.toBe(result);
    await vi.advanceTimersByTimeAsync(250); expect(pulse).toHaveBeenCalledTimes(1);
  });

  it('a different run with the same action ID does not acquire a second loop', async () => {
    await navigating(); await expect(options.onAction({ ...action, runId: 'other-run' })).resolves.toBe(result);
    expect(m.driver).toHaveBeenCalledTimes(1); expect(driverClose).toHaveBeenCalled();
    expect(controller.state.phase).toBe('recovery');
  });

  it.each(['launch read', 'driver construction'])('%s failure cannot replace the canonical result', async stage => {
    await attached();
    (stage === 'launch read' ? m.read : m.driver).mockRejectedValueOnce(new Error('Observer unavailable'));
    await expect(options.onAction(action)).resolves.toBe(result);
    expect(controller.state.phase).toBe('recovery'); expect(sdkClose).toHaveBeenCalledTimes(1);
  });

  it('a throwing UI observer cannot replace the canonical action result', async () => {
    await attached(); changed.mockImplementation(() => { throw new Error('UI observer failed'); });
    await expect(options.onAction(action)).resolves.toBe(result);
    expect(m.action).toHaveBeenCalledTimes(1);
  });

  it('Stop after local admission but before its callback returns cannot start navigation', async () => {
    await attached(); const barrier = hold(m.action), delivered = options.onAction(action);
    await barrier.entered; await controller.stop(); barrier.release();
    await expect(delivered).resolves.toBe(result); expect(m.driver).not.toHaveBeenCalled();
  });

  it.each(['Stop', 'run.terminated'])('serializes pulses and discards completion of an in-flight pulse after %s', async reason => {
    await navigating(); const completion = deferred<{ status: string }>(); pulse.mockReturnValueOnce(completion.promise);
    await vi.advanceTimersByTimeAsync(10_000); expect(pulse).toHaveBeenCalledTimes(1);
    if (reason === 'Stop') await controller.stop(); else notice(reason);
    const updates = changes.length;
    completion.resolve({ status: 'confirmed' }); await vi.advanceTimersByTimeAsync(10_000);
    expect(pulse).toHaveBeenCalledTimes(1); expect(changes).toHaveLength(updates);
  });

  it.each(['decision-required', 'terminal-acknowledged'])('%s stops pulsing without waking or claiming objective completion', async status => {
    await navigating(); pulse.mockResolvedValueOnce({ status }); await vi.advanceTimersByTimeAsync(30_000);
    expect(pulse).toHaveBeenCalledTimes(1); expect(driverClose).toHaveBeenCalled();
    expect(controller.state).toMatchObject({ phase: 'decision', active: true });
    expect(startDurable).toHaveBeenCalledTimes(1); expect(m.stop).not.toHaveBeenCalled();
  });

  it('bounds absent custody at 15 seconds without automatic retry or reconnect', async () => {
    await navigating(); await vi.advanceTimersByTimeAsync(14_999);
    expect(controller.state.phase).toBe('navigating');
    await vi.advanceTimersByTimeAsync(1); expect(controller.state.phase).toBe('recovery');
    const calls = pulse.mock.calls.length; await vi.advanceTimersByTimeAsync(30_000);
    expect(pulse).toHaveBeenCalledTimes(calls); expect(connect).toHaveBeenCalledTimes(1);
    expect(startDurable).toHaveBeenCalledTimes(1); expect(m.stop).not.toHaveBeenCalled();
  });
});
