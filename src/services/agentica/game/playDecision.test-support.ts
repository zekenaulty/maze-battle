import { afterEach, beforeEach, vi, type Mock } from 'vitest';
import type { AgenticaHostOptions } from '../sdk/agentica-host.mjs';
import type { GameSession } from '../../game/GameSession';
import type { AgenticaResult } from '../contracts';
import { launchStartFixture, launchStartedFixture } from '../../../persistence/canonical/agentica/launch.test-support';
import { protocolAction, protocolResult } from '../../../persistence/canonical/agentica/types.test-support';
import { startPlayDecision, type PlayDecisionOptions } from './playDecision';
import { deferred } from './transportGate';

const mocks = vi.hoisted(() => ({ state: vi.fn(), current: vi.fn(), custody: vi.fn(), prepare: vi.fn(), claim: vi.fn(),
  grant: vi.fn(), adopt: vi.fn(), cleanup: vi.fn(), ack: vi.fn(), validate: vi.fn(), remote: vi.fn(), prefix: vi.fn(), publication: vi.fn(),
  hooks: vi.fn(), action: vi.fn(), save: vi.fn(), driver: vi.fn(), boundary: vi.fn(), load: vi.fn(), reconcile: vi.fn(), database: vi.fn() }));
vi.mock('../../../persistence/canonical/agentica/recovery.database', () => ({ inRecoveryDatabase: mocks.database }));
vi.mock('./decisionState', () => ({ decisionState: mocks.state, assertDecisionCurrent: mocks.current, assertDecisionCustody: mocks.custody }));
vi.mock('./decisionCommit', () => ({ decisionCommits: () => ({ prepare: mocks.prepare, claim: mocks.claim, grant: mocks.grant, adopt: mocks.adopt }) }));
vi.mock('./decisionCleanup', () => ({ decisionCleanup: () => ({ cancel: mocks.cleanup, acknowledge: mocks.ack }) }));
vi.mock('./decisionRemote', () => ({ readDecisionRemote: mocks.remote, deliverDecisionPrefix: mocks.prefix }));
vi.mock('../../../persistence/canonical/agentica/decision.claim', () => ({ validateDecisionClaim: mocks.validate }));
vi.mock('../../../persistence/canonical/agentica/actions', () => ({ prepareAction: async (action: unknown) => ({ action }) }));
vi.mock('./publication', () => ({ publishGamePublication: mocks.publication }));
vi.mock('./actionHooks', () => ({ createGameActionHooks: mocks.hooks }));
vi.mock('./actionRead', () => ({ loadGameAction: mocks.load, reconcileGameAction: mocks.reconcile }));
vi.mock('./operationDriver', () => ({ createGameOperationDriver: mocks.driver }));
vi.mock('./playNavigation', async original => {
  const real = await original<typeof import('./playNavigation')>();
  return { ...real, startPlayNavigation(...args: Parameters<typeof real.startPlayNavigation>) {
    // Expose the callback for the parent's new canContinue contract; do not synthesize it from messages.
    mocks.boundary.mockImplementation(args[5]); return real.startPlayNavigation(...args);
  } };
});
export const m = mocks;

const ref = (id: string) => ({ key: `agentica/${id}`, id });
export const original = { action: { ...protocolAction(), capabilityId: 'maze.navigate' },
  binding: { grant: ref('original-grant'), publication: ref('original-publication') } };
export const successorBinding = { grant: ref('successor-grant'), publication: ref('successor-publication') };
export const successorAction = { ...original.action, runId: 'successor-run', actionId: 'successor-action' };
export const result: AgenticaResult = { ...protocolResult(successorAction),
  operation: { operationId: 'successor-navigation', summary: 'Admitted navigation.' } };
export const start = launchStartFixture(), started = launchStartedFixture(start, successorAction.runId);
const makeView = () => ({ head: { owner: 'owner', epoch: 1 }, value: {
  terminal: { event: { sessionEpoch: '1' }, bound: { start, launch: { guard: { id: 'root', owner: 'owner', epoch: 1 },
    binding: { launchId: 'launch', endpoint: 'ws://127.0.0.1:1/api/host', start } } } },
  decision: null as any, claim: null as any, grant: null as any, selected: null as any,
} });
export let view: ReturnType<typeof makeView>, options: AgenticaHostOptions, host: AbortController, scope: AbortController;
export let session: GameSession, sdk: { connect: Mock; close: Mock; listOperations: Mock; signalOperation: Mock;
  stopDecision: Mock; wakeOperation: Mock; adoptDecision: Mock };
export let update: Mock, onDecision: Mock, fail: Mock, pulse: Mock, driverClose: Mock;
const runners: ReturnType<typeof startPlayDecision>[] = [];
export function run(patch: Partial<PlayDecisionOptions> = {}) {
  const runner = startPlayDecision({ session, original, signal: scope.signal, update, onDecision, fail,
    factory: hooks => { options = hooks; return sdk; }, ...patch }); runners.push(runner); return runner;
}
export const drain = () => vi.advanceTimersByTimeAsync(0);
export async function attach() { const runner = run(); await vi.advanceTimersByTimeAsync(500); return runner; }
export async function navigate() { const runner = await attach(); await options.onAction(successorAction); return runner; }
export function notice(type: string, runId = successorAction.runId) { options.onMessage?.({ protocolVersion: 1, type, runId, payload: {} }); }
export function hold(fn: Mock) {
  const entered = deferred<void>(), released = deferred<void>(), implementation = fn.getMockImplementation()!;
  fn.mockImplementationOnce(async (...args: unknown[]) => { entered.resolve(); await released.promise; return implementation(...args); });
  return { entered: entered.promise, release: () => released.resolve() };
}

// Real runner/controller/channel/navigation timers; canonical storage and service protocol are mocked.
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); view = makeView(); host = new AbortController(); scope = new AbortController();
  session = { get hostSignal() { return host.signal; }, submitHostCommand: vi.fn(), cleanupHostOperation: vi.fn() } as unknown as GameSession;
  update = vi.fn(); onDecision = vi.fn(); fail = vi.fn(); pulse = vi.fn(async () => ({ status: 'advanced', sequence: 1 })); driverClose = vi.fn();
  sdk = { connect: vi.fn(async () => {}), close: vi.fn(() => options.onStatus?.({ state: 'disconnected' })), listOperations: vi.fn(),
    signalOperation: vi.fn(), stopDecision: vi.fn(), wakeOperation: vi.fn(async () => started), adoptDecision: vi.fn() };
  m.state.mockImplementation(async () => view); m.publication.mockResolvedValue(successorBinding.publication);
  m.database.mockImplementation(async (signal, read) => { signal.throwIfAborted(); const result = await read(signal); signal.throwIfAborted(); return result; });
  m.prepare.mockImplementation(async () => { view.value.decision = { reference: ref('decision'), terminal: view.value.terminal,
    data: { adoption: null, event: { sessionEpoch: '1' }, publication: successorBinding.publication } }; });
  m.claim.mockImplementation(async () => { view.value.claim = { data: { started, state: 'waking' }, decision: view.value.decision }; });
  m.grant.mockImplementation(async () => { view.value.grant = { record: { ref: successorBinding.grant } };
    view.value.selected = { value: { data: successorBinding } }; });
  m.remote.mockResolvedValue({ state: 'waking' }); m.prefix.mockResolvedValue(null);
  m.hooks.mockReturnValue({ onAction: m.action, saveAction: m.save }); m.action.mockResolvedValue(result);
  m.driver.mockResolvedValue({ pulse, close: driverClose });
  m.ack.mockResolvedValue({ status: 'navigation-acknowledged' });
});
afterEach(() => { for (const runner of runners.splice(0)) runner.close(); vi.clearAllTimers(); vi.useRealTimers(); });
