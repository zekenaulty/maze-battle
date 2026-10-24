import { GameSession } from '../../src/services/game/GameSession';
import type { CanonicalHostCommand, CanonicalHostPort } from '../../src/services/game/CanonicalHostCommand';
import { AgenticaHost, actionKey } from '../../src/services/agentica/sdk/agentica-host.mjs';
import type { AgenticaAction } from '../../src/services/agentica/contracts';
import { prepareGameLaunch } from '../../src/services/agentica/game/launch';
import { createGameTransport } from '../../src/services/agentica/game/transport';
import { deferred } from '../../src/services/agentica/game/transportGate';
import { loadGameAction, reconcileGameAction } from '../../src/services/agentica/game/actionRead';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { prepareAction, readAction } from '../../src/persistence/canonical/agentica/actions';
import { destinationKey } from '../../src/persistence/canonical/navigation/records';
import { earnedTargets } from './canonical-agentica-actions.setup';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5243') throw Error('Isolated review fixture origin required');
type Client = Awaited<ReturnType<typeof createGameTransport>>;
type Barrier = { operation: string; stage: 'before-execute' | 'after-commit'; claimed: boolean; entered: boolean;
  release: ReturnType<typeof deferred<void>> };
let session: GameSession, barrier: Barrier | undefined;
const clients: Client[] = [], sdks: AgenticaHost[] = [];
const starts: { status: string; error?: string }[] = [], notices: { type: string; runId?: string }[] = [];
const port: CanonicalHostPort = {
  get hostSignal() { return session.hostSignal; },
  async submitHostCommand(command: CanonicalHostCommand) {
    const b = barrier;
    if (!b || b.claimed || command.kind !== 'fresh' || command.operation !== b.operation) return session.submitHostCommand(command);
    b.claimed = true;
    // Pause before entering the real gated executor, never inside an IndexedDB transaction.
    const receipt = await session.submitHostCommand({ ...command, async execute(request, options) {
      if (b.stage === 'before-execute') { b.entered = true; await b.release.promise; }
      return command.execute(request, options);
    } });
    if (b.stage === 'after-commit') { b.entered = true; await b.release.promise; }
    return receipt;
  },
};
async function boot() {
  session = new GameSession(() => {}); await session.start();
  if (!session.view.controlled) throw Error(session.view.status);
  const launch = await prepareGameLaunch(port, { endpoint: 'ws://127.0.0.1:5243/api/host',
    objectiveId: crypto.randomUUID(), objective: 'Inspect earned surroundings without choosing hidden destinations.',
    provider: { provider: 'fixture', contextWindowTokens: 8192, maxOutputTokens: 256 },
    limits: { maxSteps: 8, maxRefinements: 0, maxPlanContinuations: 0, timeoutSeconds: 60, actionTimeoutSeconds: 15 } });
  return { ...launch, ...earnedTargets(session) };
}
async function attach() {
  const launch = (await readLaunch()).value!;
  const client = await createGameTransport(port, launch.binding.launchId, options => {
    const sdk = new AgenticaHost({ ...options, onMessage(message) {
      options.onMessage?.(message); notices.push({ type: message.type, runId: message.runId });
    } });
    sdks.push(sdk); return sdk;
  });
  clients.push(client); starts.push({ status: 'prepared' }); return clients.length - 1;
}
function begin(index = 0) {
  starts[index] = { status: 'pending' };
  void clients[index].start().then(() => { starts[index] = { status: 'attached' }; },
    error => { starts[index] = { status: 'failed', error: String(error) }; });
}
async function audit(action: AgenticaAction) {
  const identity = await prepareAction(action), id = `travel-${identity.storageKey.slice(-64)}`;
  const read = await readCanonical(async pages => ({ original: await readAction(pages, identity),
    operation: await pages.liveOperation(id) ?? null, destination: await pages.get('execution', destinationKey(id)) ?? null }));
  return { head: read.head, ...read.value };
}
const api = { boot, attach, begin, audit,
  async consumerSnapshot() {
    const db = await openCanonicalDatabase();
    try {
      const names = Array.from(db.objectStoreNames), tx = db.transaction(names, 'readonly'), database = [];
      for (const name of names) {
        const store = tx.objectStore(name);
        database.push({ store: name, keys: await store.getAllKeys(), values: await store.getAll() });
      }
      await tx.done;
      // Read-only observation of the real SDK; no private dispatch method is invoked.
      const authority = sdks.map(sdk => ({ connected: sdk.connected,
        pending: [...(Reflect.get(sdk, 'pending') as Map<string, unknown>).keys()],
        runs: [...(Reflect.get(sdk, 'runs') as Map<string, unknown>)],
        actions: [...(Reflect.get(sdk, 'actions') as Map<string, unknown>)],
        operations: [...(Reflect.get(sdk, 'operations') as Map<string, unknown>)],
        stopped: [...(Reflect.get(sdk, 'stoppedRuns') as Set<string>)],
        queued: Reflect.get(sdk, 'queuedActions'), dropped: Reflect.get(sdk, 'droppedMessages') }));
      return { database, authority, phases: clients.map(c => c.phase),
        messages: sdks.map(sdk => Reflect.get(sdk, 'messages') as unknown[]),
        controlled: session.view.controlled, recoveryRequired: session.view.recoveryRequired ?? false };
    } finally { db.close(); }
  },
  hold(operation: string, stage: Barrier['stage']) {
    if (barrier) throw Error('Review barrier already installed');
    barrier = { operation, stage, claimed: false, entered: false, release: deferred<void>() };
  },
  release() { barrier?.release.resolve(); },
  status() { return { starts, phases: clients.map(c => c.phase), held: barrier?.entered ?? false, notices,
    controlled: session?.view.controlled, recoveryRequired: session?.view.recoveryRequired }; },
  async drain() {
    // Observe SDK queue completion only; do not invoke private dispatch or grant authority.
    await Promise.all(sdks.map(sdk => Reflect.get(sdk, 'actionQueue') as Promise<void>));
    await session?.flush();
  },
  async cancelGuard() {
    const current = await readLaunch(), guard = current.value!.guard;
    return session.cleanupHostOperation({ kind: 'cancel', target: {
      gameId: current.head.gameId, generation: current.head.generation, operationId: guard.id } });
  },
  async coldRead(action: AgenticaAction) {
    return { loaded: await loadGameAction(actionKey(action)), reconciled: await reconcileGameAction(action) };
  },
  async launch() { return (await readLaunch()).value; },
  async head() { return (await readCanonicalHead()).head; },
  close(index = 0) { clients[index].close(); },
  stop() { clients.forEach(c => c.close()); barrier?.release.resolve(); session?.stop(); },
};
declare global { interface Window { transportReview: typeof api } }
window.transportReview = api;
