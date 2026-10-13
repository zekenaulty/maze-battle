import type { AgenticaAction, AgenticaActionRecord } from '../../src/services/agentica/contracts';
import { actionFingerprint, actionKey } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { createGameActionHooks } from '../../src/services/agentica/game/actionHooks';
import type { CanonicalHostCommand, CanonicalHostPort } from '../../src/services/game/CanonicalHostCommand';
import { readCanonical } from '../../src/persistence/canonical/read';
import { prepareAction, readAction } from '../../src/persistence/canonical/agentica/actions';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { destinationKey } from '../../src/persistence/canonical/navigation/records';
import { earnedTargets, fundLaunch, startGame } from './canonical-agentica-actions.setup';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
const outcome = <T>(work: Promise<T>) => work.then(value => ({ value, error: null }),
  (error: Error) => ({ value: null, error: { name: error.name, message: error.message } }));
const pending = (action: AgenticaAction): AgenticaActionRecord => ({ fingerprint: actionFingerprint(action), status: 'pending' });

async function setup() {
  const session = await startGame();
  try {
    const funded = await fundLaunch(session), launch = (await readLaunch()).value!, run = launch.run!.value.data.started;
    const binding = { publication: funded.publication, grant: launch.grant!.ref };
    const action: AgenticaAction = { actionId: crypto.randomUUID(), runnerRunId: crypto.randomUUID(), stepId: crypto.randomUUID(),
      runId: run.runId, sessionId: run.sessionId, sessionEpoch: run.sessionEpoch, manifestHash: run.manifestHash,
      capabilityId: 'maze.navigate', arguments: { ...earnedTargets(session).target },
      expectedRevision: funded.start.observation.revision, deadlineAt: new Date(Date.now() + 300_000).toISOString() };
    const hooks = (port: CanonicalHostPort = session) => createGameActionHooks(port, binding);
    const reserve = (h: ReturnType<typeof hooks>, a = action) => h.saveAction!(actionKey(a), pending(a));
    const signal = session.hostSignal;
    return { session, signal, action, hooks, reserve,
      async restart() { session.stop(); await session.start(); return { oldAborted: signal.aborted,
        replaced: signal !== session.hostSignal, currentAborted: session.hostSignal.aborted, controlled: session.view.controlled }; },
    };
  } catch (error) { session.stop(); throw error; }
}
async function withGame<T>(run: (c: Awaited<ReturnType<typeof setup>>) => Promise<T>) {
  const c = await setup();
  try { return await run(c); } finally { c.session.stop(); }
}
async function audit(action: AgenticaAction) {
  const identity = await prepareAction(action), id = `travel-${identity.storageKey.slice(-64)}`;
  const read = await readCanonical(async pages => ({ original: await readAction(pages, identity),
    operation: await pages.liveOperation(id) ?? null, destination: await pages.get('execution', destinationKey(id)) ?? null }));
  return { head: read.head, ...read.value };
}

export function pendingRestart(negativeControl = false) {
  return withGame(async c => {
    // Deliberately discard BOTH fences only in this test control. Canonical grant/custody checks stay real.
    const unfenced: CanonicalHostPort = { hostSignal: new AbortController().signal, submitHostCommand(command) {
      const copy = { ...command }; delete copy.signal; return c.session.submitHostCommand(copy);
    } };
    const hooks = c.hooks(negativeControl ? unfenced : c.session);
    await c.reserve(hooks); const before = await audit(c.action), signals = await c.restart(), restarted = await audit(c.action);
    const attempted = await outcome(hooks.onAction!(c.action));
    return { before, restarted, after: await audit(c.action), signals, attempted };
  });
}

export function suspendedSubmit(stage: 'reserve' | 'effect') {
  return withGame(async c => {
    const entered = deferred(), release = deferred();
    let captured: CanonicalHostCommand | undefined, executorCalls = 0;
    const port: CanonicalHostPort = { get hostSignal() { return c.session.hostSignal; }, async submitHostCommand(command) {
      if (command.kind === 'fresh' && command.operation === (stage === 'reserve' ? 'agentica.action.reserve' : 'operation.admit')) {
        captured = command; entered.resolve(); await release.promise;
        return c.session.submitHostCommand({ ...command, execute: (request, options) => {
          executorCalls++; return command.execute(request, options);
        } });
      }
      return c.session.submitHostCommand(command);
    } };
    const hooks = c.hooks(port);
    if (stage === 'effect') await c.reserve(hooks);
    const before = await audit(c.action);
    const running = stage === 'reserve' ? outcome(c.reserve(hooks)) : outcome(hooks.onAction!(c.action));
    try {
      await Promise.race([entered.promise, running.then(() => { throw Error('Deferred submit was not reached'); })]);
      const forwardedOriginalSignal = captured!.signal === c.signal, signals = await c.restart(), restarted = await audit(c.action);
      release.resolve(); const attempted = await running;
      return { before, restarted, after: await audit(c.action), signals, forwardedOriginalSignal, executorCalls, attempted };
    } finally { release.resolve(); await running; }
  });
}

export function pendingColdHooks() {
  return withGame(async c => {
    await c.reserve(c.hooks()); const before = await audit(c.action), signals = await c.restart(), hooks = c.hooks();
    await c.reserve(hooks);
    const attempted = await hooks.onAction!(c.action), reconciled = await hooks.reconcileAction!(c.action, pending(c.action));
    const after = await audit(c.action);
    // A genuinely new action still works under this same guard, owner and publication.
    const fresh = { ...c.action, actionId: crypto.randomUUID() };
    await c.reserve(hooks, fresh); const control = await hooks.onAction!(fresh);
    return { before, after, signals, attempted, reconciled, control, fresh: await audit(fresh) };
  });
}

export function queuedBeforeRestart() {
  return withGame(async c => {
    const entered = deferred(), queued = deferred(), release = deferred();
    let executorCalls = 0;
    const port: CanonicalHostPort = { get hostSignal() { return c.session.hostSignal; }, submitHostCommand(command) {
      if (command.kind !== 'fresh' || command.operation !== 'operation.admit') return c.session.submitHostCommand(command);
      const result = c.session.submitHostCommand({ ...command, execute: (request, options) => {
        executorCalls++; return command.execute(request, options);
      } });
      queued.resolve(); return result;
    } };
    const hooks = c.hooks(port); await c.reserve(hooks); const before = await audit(c.action);
    // Hold the writer before opening any transaction so restart can abort queued work deterministically.
    const blocked = outcome(c.session.submitHostCommand({ kind: 'fresh', operation: 'fixture.queue-barrier', input: {}, signal: c.signal,
      execute: async (_request, { signal }) => {
        entered.resolve(); await release.promise; signal.throwIfAborted(); throw Error('Queue barrier was not aborted');
      } }));
    await entered.promise;
    const running = outcome(hooks.onAction!(c.action));
    try {
      await Promise.race([queued.promise, running.then(() => { throw Error('Effect was not queued'); })]);
      const restarting = c.restart(); release.resolve();
      const signals = await restarting, attempted = await running, barrier = await blocked;
      return { before, after: await audit(c.action), signals, attempted, barrier, executorCalls };
    } finally { release.resolve(); await blocked; await running; }
  });
}

export function completedOldHooks() {
  return withGame(async c => {
    const hooks = c.hooks(); await c.reserve(hooks); const result = await hooks.onAction!(c.action), before = await audit(c.action);
    const signals = await c.restart(), loaded = await hooks.loadAction!(actionKey(c.action));
    await hooks.saveAction!(actionKey(c.action), { fingerprint: actionFingerprint(c.action), status: 'completed', result });
    const replay = await hooks.onAction!(c.action), reconciled = await hooks.reconcileAction!(c.action, null);
    const rejected = await outcome(hooks.saveAction!(actionKey(c.action), { fingerprint: actionFingerprint(c.action),
      status: 'completed', result: { ...result, summary: 'Changed historical result' } }));
    return { result, before, after: await audit(c.action), signals, loaded, replay, reconciled, rejected };
  });
}
