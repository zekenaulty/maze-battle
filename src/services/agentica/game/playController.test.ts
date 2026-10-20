// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AgenticaAction, AgenticaResult } from '../contracts';
import type { AgenticaHost, AgenticaHostOptions, HostStartSubmission } from '../sdk/agentica-host.mjs';
import type { GameSession } from '../../game/GameSession';
import type { CanonicalHostCommand, CanonicalHostPort } from '../../game/CanonicalHostCommand';
import type { CanonicalRequest } from '../../../persistence/canonical/types';
import { launchEntryFixture, launchStartFixture, launchStartedFixture } from '../../../persistence/canonical/agentica/launch.test-support';
import { protocolResult } from '../../../persistence/canonical/agentica/types.test-support';
import { createGamePlayController, type GamePlayState } from './playController';
import type { GameLaunchOptions } from './launch';
import { deferred } from './transportGate';
import { mazeCapabilities } from './capabilities';
import type { PlayDecisionOptions } from './playDecision';
import type { PlayAdoptionOffer } from './playAdoption';
import { actionFingerprint, actionKey } from '../sdk/agentica-host.mjs';
import { completionSdk, completionStore } from './playCompletion.test-support';

const m = vi.hoisted(() => ({ read: vi.fn(), prepare: vi.fn(), execute: vi.fn(), publication: vi.fn(),
  hooks: vi.fn(), action: vi.fn(), save: vi.fn(), load: vi.fn(), reconcile: vi.fn(), driver: vi.fn(), stop: vi.fn(), decision: vi.fn(),
  adoption: vi.fn(), allowance: vi.fn() }));
vi.mock('../../../persistence/canonical/agentica/launch', () => ({ readLaunch: m.read, executeLaunchCommand: m.execute }));
vi.mock('../../../persistence/canonical/agentica/publication', () => ({ assertPublicationCurrent: m.publication }));
vi.mock('./launch', () => ({ prepareGameLaunch: m.prepare }));
vi.mock('./actionHooks', () => ({ createGameActionHooks: m.hooks }));
vi.mock('./actionRead', () => ({ loadGameAction: m.load, reconcileGameAction: m.reconcile }));
vi.mock('./manifestDigest', () => ({ mazeManifestDigest: async () => `sha256:${'a'.repeat(64)}` }));
vi.mock('./operationDriver', () => ({ createGameOperationDriver: m.driver }));
vi.mock('./playStop', () => ({ stopGamePlay: m.stop }));
vi.mock('./playDecision', () => ({ startPlayDecision: m.decision }));
vi.mock('./playAdoption', () => ({ inspectPlayAdoption: m.adoption }));
vi.mock('./playAllowance', () => ({ readPlayDecisionAllowance: m.allowance }));

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
  m.decision.mockReturnValue({ close: vi.fn() });
  m.allowance.mockResolvedValue(1);
  controller = createGamePlayController(session, changed, hooks => {
    options = hooks;
    return { connect, startDurable, close: sdkClose } as unknown as AgenticaHost;
  });
});

describe('explicit same-owner continuation mount', () => {
  async function boundary() {
    await navigating(); pulse.mockResolvedValueOnce({ status: 'decision-required' });
    await vi.advanceTimersByTimeAsync(250);
    expect(controller.state).toMatchObject({ phase: 'decision', canContinue: true });
    expect(m.decision).not.toHaveBeenCalled();
  }
  const runner = () => m.decision.mock.calls[0][0] as PlayDecisionOptions;
  it('uses the original action and grant with one explicit window, not a replacement start', async () => {
    await boundary(); await controller.continueDecision();
    expect(m.decision).toHaveBeenCalledOnce();
    expect(runner().original).toEqual({ action, binding: { grant: ref, publication: ref } });
    expect(startDurable).toHaveBeenCalledOnce(); expect(acquire).toHaveBeenCalledOnce(); expect(releaseControl).not.toHaveBeenCalled();
    expect(() => controller.continueDecision()).toThrow('explicit available decision');
    m.allowance.mockResolvedValueOnce(0);
    runner().onDecision({ action: { ...action, actionId: 'successor' }, binding: { grant: ref, publication: ref } },
      { phase: 'decision', message: 'Next decision', canContinue: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.state).toMatchObject({ phase: 'decision', canContinue: false, active: true });
    expect(() => controller.continueDecision()).toThrow();
    await controller.stop(); expect(releaseControl).toHaveBeenCalledOnce();
  });
  it.each(['idle', 'running', 'navigating', 'nondecision terminal', 'zero limit'])('does not offer continuation at %s', async phase => {
    if (phase === 'zero limit') {
      m.allowance.mockResolvedValue(0);
      await controller.start({ ...config, limits: { ...config.limits, maxPlanContinuations: 0 } });
    }
    else if (phase !== 'idle') await attached();
    if (['navigating', 'nondecision terminal', 'zero limit'].includes(phase)) {
      await options.onAction(action);
      if (phase !== 'navigating') {
        pulse.mockResolvedValueOnce({ status: phase === 'zero limit' ? 'decision-required' : 'terminal-acknowledged' });
        await vi.advanceTimersByTimeAsync(250);
      }
    }
    expect(() => controller.continueDecision()).toThrow(); expect(m.decision).not.toHaveBeenCalled();
  });
  it('Stop overtakes the continuation flush without constructing a runner', async () => {
    await boundary(); const barrier = hold(flush), continuation = controller.continueDecision();
    await barrier.entered; await controller.stop(); barrier.release(); await continuation;
    expect(m.decision).not.toHaveBeenCalled(); expect(controller.state.phase).toBe('stopped');
  });
  it('a withdrawn runner cannot publish another boundary or failure', async () => {
    await boundary(); await controller.continueDecision(); const input = runner();
    await controller.stop(); expect(input.signal.aborted).toBe(true);
    expect(m.decision.mock.results[0].value.close).toHaveBeenCalled();
    const updates = changes.length;
    input.onDecision(input.original, { phase: 'decision', message: 'Late', canContinue: true });
    input.update({ phase: 'running', message: 'Late' }); input.fail(Error('Late'));
    expect(changes).toHaveLength(updates); expect(controller.state.phase).toBe('stopped');
  });
  it('holds control after successor satisfaction and ignores later running pulses or boundaries', async () => {
    await boundary(); await controller.continueDecision(); const input = runner();
    input.update({ phase: 'satisfied', message: 'Host objective satisfied.' });
    expect(controller.state).toMatchObject({ phase: 'satisfied', active: true, canContinue: false, error: undefined });
    expect(releaseControl).not.toHaveBeenCalled(); expect(m.decision.mock.results[0].value.close).not.toHaveBeenCalled();
    const updates = changes.length;
    input.update({ phase: 'running', message: 'Late pulse' });
    input.onDecision(input.original, { phase: 'decision', message: 'Late boundary', canContinue: true });
    input.fail(Error('Late failure'));
    expect(changes).toHaveLength(updates); expect(() => controller.continueDecision()).toThrow();
    await controller.stop(); expect(controller.state.phase).toBe('stopped'); expect(releaseControl).toHaveBeenCalledOnce();
    input.update({ phase: 'satisfied', message: 'Late completion' }); expect(controller.state.phase).toBe('stopped');
  });
  it('does not accept late satisfaction from a runner that already returned a decision boundary', async () => {
    await boundary(); await controller.continueDecision(); const input = runner();
    input.onDecision(input.original, { phase: 'decision', message: 'Next decision', canContinue: true });
    await vi.advanceTimersByTimeAsync(0);
    const updates = changes.length; input.update({ phase: 'satisfied', message: 'Late completion' });
    expect(changes).toHaveLength(updates); expect(controller.state.phase).toBe('decision');
  });
  it('a stale lifetime cannot continue a retained boundary', async () => {
    await boundary(); host.abort(); expect(() => controller.continueDecision()).toThrow();
    expect(m.decision).not.toHaveBeenCalled(); expect(releaseControl).toHaveBeenCalledOnce();
  });
  it('does not enable a continuation from a late allowance read after Stop', async () => {
    await navigating(); const barrier = hold(m.allowance); pulse.mockResolvedValueOnce({ status: 'decision-required' });
    await vi.advanceTimersByTimeAsync(250); await barrier.entered;
    await controller.stop(); const updates = changes.length; barrier.release(); await vi.advanceTimersByTimeAsync(0);
    expect(changes).toHaveLength(updates); expect(controller.state.canContinue).toBe(false);
  });
  it.each(['resolve', 'reject'])('a late allowance %s cannot change a replacement attempt', async outcome => {
    const allowance = deferred<number>();
    await navigating(); m.allowance.mockReturnValueOnce(allowance.promise);
    pulse.mockResolvedValueOnce({ status: 'decision-required' });
    await vi.advanceTimersByTimeAsync(250);
    expect(controller.state.message).toBe('Checking retained execution allowance.');
    await controller.stop(); retained = null; await attached();
    const before = controller.state, updates = changes.length;
    if (outcome === 'resolve') allowance.resolve(1); else allowance.reject(Error('Old allowance failure'));
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.state).toEqual(before); expect(changes).toHaveLength(updates);
  });
});

describe('canonical host completion without releasing cleanup custody', () => {
  const inspection = { ...action, actionId: 'completion-inspect', capabilityId: 'maze.inspect', arguments: { scope: 'objective' } };
  const completed: AgenticaResult = { ...protocolResult(inspection),
    completion: { objectiveId: start.objectiveId, evidenceId: 'host-proof', summary: 'Selected item carried to the earned entrance.' } };

  it.each([{}, { status: 'failed' }, { status: 'succeeded', reason: 'complete' }])(
    'preserves completion custody without interpreting outcome %j as acknowledgement', async payload => {
    await attached(); m.action.mockResolvedValueOnce(completed);
    const reply = await options.onAction(inspection);
    expect(reply).toBe(completed); expect(sdkClose).not.toHaveBeenCalled();
    expect(controller.state).toMatchObject({ phase: 'satisfied', active: true, canContinue: false, error: undefined });
    expect(releaseControl).not.toHaveBeenCalled(); expect(m.stop).not.toHaveBeenCalled(); expect(m.driver).not.toHaveBeenCalled();
    expect(() => controller.continueDecision()).toThrow();
    notice('outcome', inspection.runId, payload); expect(sdkClose).toHaveBeenCalledOnce();
    expect(controller.state).toMatchObject({ phase: 'satisfied', active: true, canContinue: false, error: undefined });
    expect(controller.state.message).toBe('Host objective satisfied; Agentica outcome received. Retained cleanup still requires Stop.');
    expect(releaseControl).not.toHaveBeenCalled(); expect(m.stop).not.toHaveBeenCalled();
    await controller.stop(); expect(m.stop).toHaveBeenCalledOnce(); expect(releaseControl).toHaveBeenCalledOnce();
  });

  it('keeps local proof and explicit Stop when the SDK reports a post-hook result failure', async () => {
    await attached(); m.action.mockResolvedValueOnce(completed);
    await expect(options.onAction(inspection)).resolves.toBe(completed);
    options.onStatus?.({ state: 'action.error', detail: 'Post-hook storage read failed.' });
    expect(controller.state).toMatchObject({ phase: 'satisfied', active: true, canContinue: false, error: undefined });
    expect(controller.state.message).toContain('Service delivery is unconfirmed');
    notice('outcome'); expect(controller.state.message).toContain('Service delivery is unconfirmed');
    expect(releaseControl).not.toHaveBeenCalled();
    await controller.stop(); expect(m.stop).toHaveBeenCalledOnce(); expect(releaseControl).toHaveBeenCalledOnce();
  });

  it('does not turn an outcome payload into host completion', async () => {
    await attached();
    options.onMessage?.({ protocolVersion: 1, type: 'outcome', runId: inspection.runId,
      payload: { completion: completed.completion, objectiveId: start.objectiveId } });
    expect(controller.state).toMatchObject({ phase: 'recovery', active: true });
    expect(changes.some(state => state.phase === 'satisfied')).toBe(false); expect(m.stop).not.toHaveBeenCalled();
  });

  it.each(['stop', 'close', 'host abort', 'new lifetime'])('fences a late completion after %s without changing its committed reply', async kind => {
    await attached(); m.action.mockResolvedValue(completed);
    const barrier = hold(m.action), delivery = options.onAction(inspection); await barrier.entered;
    if (kind === 'stop') await controller.stop();
    else if (kind === 'close') controller.close();
    else if (kind === 'host abort') host.abort();
    else host = new AbortController();
    const updates = changes.length;
    barrier.release(); await expect(delivery).resolves.toBe(completed);
    expect(changes).toHaveLength(updates); expect(changes.some(state => state.phase === 'satisfied')).toBe(false);
  });

  it('retains an explicit selected quest through pending launch preparation without selecting one by default', async () => {
    const input = { ...config, returnQuestId: 'owner-selection' }, barrier = hold(flush), startup = controller.start(input);
    await barrier.entered; input.returnQuestId = 'changed'; barrier.release(); await startup;
    expect(m.prepare.mock.calls[0][1]).toMatchObject({ returnQuestId: 'owner-selection', objective: config.objective });
  });
});

describe('initial completion through the real SDK', () => {
  async function setup() {
    const inspection = { ...action, actionId: 'completion', capabilityId: 'maze.inspect', arguments: { scope: 'objective' },
      deadlineAt: new Date(Date.now() + 60_000).toISOString() };
    const completed = { ...protocolResult(inspection),
      completion: { objectiveId: start.objectiveId, evidenceId: 'host-proof', summary: 'Satisfied locally.' } };
    const store = completionStore(inspection, completed);
    m.load.mockImplementation(store.load); m.save.mockImplementation(store.save);
    m.action.mockImplementation(store.execute); m.reconcile.mockImplementation(store.reconcile);
    let wire!: ReturnType<typeof completionSdk>;
    controller.close(); controller = createGamePlayController(session, changed, hooks => {
      options = hooks; wire = completionSdk(hooks, inspection, start.objectiveId);
      wire.sdk.startDurable = startDurable; return wire.sdk;
    });
    await controller.start(config);
    const extra = { ...action, actionId: 'fresh-after-completion', deadlineAt: inspection.deadlineAt };
    return { inspection, completed, extra, store, wire };
  }
  it('seals extra action admission without blocking the reply, completed saves or original replay', async () => {
    const f = await setup();
    await f.wire.deliver(f.inspection); await f.wire.deliver(f.extra);
    expect(f.wire.frames.map(frame => frame.payload.disposition)).toEqual(['applied', 'unresolved']);
    expect(f.wire.frames[0].payload).toEqual(f.completed); expect(f.wire.close).not.toHaveBeenCalled();
    expect(m.save).toHaveBeenCalledOnce(); expect(m.action).toHaveBeenCalledOnce();
    expect(f.store.records.has(actionKey(f.extra))).toBe(false); expect(f.store.effect).not.toHaveBeenCalled();
    expect(m.driver).not.toHaveBeenCalled(); expect(m.stop).not.toHaveBeenCalled();
    await expect(options.onAction(f.extra)).rejects.toThrow('sealed fresh action execution');
    await expect(options.onAction({ ...f.inspection, arguments: { scope: 'cell' } })).rejects.toThrow('sealed');
    const record = f.store.records.get(actionKey(f.inspection))!;
    await expect(options.saveAction(actionKey(f.inspection), record)).resolves.toBeUndefined();
    await expect(options.saveAction(actionKey(f.inspection), { ...record, fingerprint: actionFingerprint(f.extra) })).rejects.toThrow('manufacture');
    await expect(options.reconcileAction!(f.inspection, record)).resolves.toEqual(f.completed);
    await f.wire.deliver(f.inspection, 'action.reconcile');
    expect(f.wire.frames.at(-1)!.payload).toEqual(f.completed);
    expect(m.action).toHaveBeenCalledOnce(); expect(m.save).toHaveBeenCalledOnce();
    expect(controller.state).toMatchObject({ phase: 'satisfied', active: true, canContinue: false, error: undefined });
    await controller.stop(); expect(m.stop).toHaveBeenCalledOnce(); expect(releaseControl).toHaveBeenCalledOnce();
  });
  it('reports a real post-hook SDK failure without losing proof, Stop, or the unresolved reply', async () => {
    const f = await setup(); let failed = false;
    m.load.mockImplementation(async key => {
      if (!failed && f.store.records.get(key)?.status === 'completed') { failed = true; throw Error('Storage read failed'); }
      return f.store.load(key);
    });
    await f.wire.deliver(f.inspection);
    expect(f.wire.frames[0].payload.disposition).toBe('unresolved');
    expect(controller.state).toMatchObject({ phase: 'satisfied', active: true, canContinue: false, error: undefined });
    expect(controller.state.message).toContain('Service delivery is unconfirmed'); expect(f.wire.close).not.toHaveBeenCalled();
    await f.wire.deliver(f.inspection);
    expect(f.wire.frames.at(-1)!.payload).toEqual(f.completed); expect(m.action).toHaveBeenCalledOnce();
    f.wire.notice('outcome', { status: 'failed' });
    expect(controller.state.message).toContain('Service delivery is unconfirmed');
    await controller.stop(); expect(m.stop).toHaveBeenCalledOnce();
  });
  it('also seals when the SDK loads and replays an already committed completion', async () => {
    const f = await setup();
    f.store.records.set(actionKey(f.inspection), { fingerprint: actionFingerprint(f.inspection), status: 'completed', result: f.completed });
    await f.wire.deliver(f.inspection);
    expect(f.wire.frames[0].payload).toEqual(f.completed);
    await expect(options.onAction(f.extra)).rejects.toThrow('sealed');
    await f.wire.deliver(f.extra);
    expect(m.save).not.toHaveBeenCalled(); expect(m.action).not.toHaveBeenCalled(); expect(f.store.effect).not.toHaveBeenCalled();
  });
  it.each(['stop', 'takeover', 'new lifetime'])('fences late SDK completion/status on %s while retaining completed persistence', async kind => {
    const f = await setup(), barrier = hold(m.action), delivery = f.wire.deliver(f.inspection); await barrier.entered;
    if (kind === 'stop') await controller.stop(); else if (kind === 'takeover') host.abort(); else host = new AbortController();
    const updates = changes.length;
    barrier.release(); await delivery;
    options.onStatus?.({ state: 'action.error', detail: 'Late failure' }); f.wire.notice('outcome', { status: 'failed' });
    expect(changes).toHaveLength(updates); expect(changes.some(s => s.phase === 'satisfied')).toBe(false);
    await expect(options.saveAction(actionKey(f.inspection), f.store.records.get(actionKey(f.inspection))!)).resolves.toBeUndefined();
    await f.wire.deliver(f.extra);
    expect(m.save).toHaveBeenCalledOnce(); expect(m.action).toHaveBeenCalledOnce(); expect(f.store.effect).not.toHaveBeenCalled();
  });
});

describe('explicit inspected-original adoption mount', () => {
  const offer: PlayAdoptionOffer = {
    fence: { generation: 'generation', gameId: 'game', owner: 'owner', epoch: 2, revision: 3 },
    candidate: { operationId: 'navigation', original: ref, binding: { grant: ref, publication: ref } },
    launchId: 'retained-launch', original: { action, binding: { grant: ref, publication: ref } },
    objective: 'Original objective', profile: { endpoint: config.endpoint, provider: config.provider, limits: config.limits },
    remainingContinuations: 1,
  };
  beforeEach(() => { m.adoption.mockResolvedValue(structuredClone(offer)); });
  it('rereads the exact offer before adopting and discloses its retained profile without a new launch', async () => {
    await controller.adoptDecision(offer);
    expect(m.adoption).toHaveBeenCalledWith(session, offer.fence, offer.candidate, { signal: expect.any(AbortSignal) });
    expect(m.decision).toHaveBeenCalledWith(expect.objectContaining({ original: offer.original, mode: 'adopt' }));
    expect(controller.state).toMatchObject({ active: true, launchId: offer.launchId, objective: offer.objective, profile: offer.profile });
    expect(m.prepare).not.toHaveBeenCalled(); expect(startDurable).not.toHaveBeenCalled();
    expect(acquire).toHaveBeenCalledOnce(); expect(() => controller.adoptDecision(offer)).toThrow();
    await controller.stop(); expect(m.stop).toHaveBeenCalledWith(session, offer.launchId, host.signal);
  });
  it.each(['null', 'objective', 'profile', 'fence'])('a changed %s offer cannot execute or Stop an unvalidated root', async change => {
    const stale = structuredClone(offer);
    if (change === 'objective') stale.objective = 'Changed';
    if (change === 'profile') stale.profile.provider.model = 'Changed';
    if (change === 'fence') stale.fence.revision++;
    m.adoption.mockResolvedValue(change === 'null' ? null : stale);
    await controller.adoptDecision(offer);
    expect(m.decision).not.toHaveBeenCalled(); expect(controller.state.phase).toBe('recovery');
    expect(controller.state.launchId).toBeUndefined();
    await controller.stop(); expect(m.stop).not.toHaveBeenCalled(); expect(releaseControl).toHaveBeenCalledOnce();
  });
  it.each(['flush', 'inspection'])('Stop overtakes adoption %s without waiting for a late read', async stage => {
    const barrier = hold(stage === 'flush' ? flush : m.adoption), pending = controller.adoptDecision(offer);
    await barrier.entered; await controller.stop(); expect(controller.state.phase).toBe('stopped');
    expect(m.stop).not.toHaveBeenCalled(); expect(releaseControl).toHaveBeenCalledOnce();
    barrier.release(); await pending; expect(m.decision).not.toHaveBeenCalled();
  });
  it('a replaced lifetime during offer inspection cannot mount adoption', async () => {
    const barrier = hold(m.adoption), pending = controller.adoptDecision(offer);
    await barrier.entered; host.abort(); barrier.release(); await pending;
    expect(m.decision).not.toHaveBeenCalled(); expect(releaseControl).toHaveBeenCalledOnce();
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
