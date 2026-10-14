import { GameSession } from '../../src/services/game/GameSession';
import type { CanonicalHostPort } from '../../src/services/game/CanonicalHostCommand';
import { prepareGameLaunch } from '../../src/services/agentica/game/launch';
import { createGameTransport } from '../../src/services/agentica/game/transport';
import { deferred } from '../../src/services/agentica/game/transportGate';
import { loadGameAction, reconcileGameAction } from '../../src/services/agentica/game/actionRead';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { readCanonicalHead } from '../../src/persistence/canonical/read';
import type { AgenticaAction } from '../../src/services/agentica/contracts';
import { earnedTargets } from './canonical-agentica-actions.setup';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5244') throw Error('Isolated transport fixture origin required');
let session: GameSession, client: Awaited<ReturnType<typeof createGameTransport>> | undefined;
let result: { status: string; error?: string; value?: unknown } = { status: 'idle' };
let held = '', entered = false, release = deferred<void>();
const port: CanonicalHostPort = {
  get hostSignal() { return session.hostSignal; },
  async submitHostCommand(command) {
    if (command.kind === 'fresh' && command.operation === held) { entered = true; await release.promise; }
    return session.submitHostCommand(command);
  },
};
async function boot() {
  session = new GameSession(() => {}); await session.start();
  if (!session.view.controlled) throw Error(session.view.status);
  const launch = await prepareGameLaunch(port, { endpoint: 'ws://127.0.0.1:5244/api/host',
    objectiveId: crypto.randomUUID(), objective: 'Inspect earned surroundings. Do not select hidden destinations.',
    provider: { provider: 'fixture', contextWindowTokens: 8192, maxOutputTokens: 256 },
    limits: { maxSteps: 8, maxRefinements: 0, maxPlanContinuations: 0, timeoutSeconds: 60, actionTimeoutSeconds: 15 } });
  return { ...launch, ...earnedTargets(session), head: (await readCanonicalHead()).head };
}
async function attach() {
  const launch = (await readLaunch()).value!;
  client = await createGameTransport(port, launch.binding.launchId);
}
function begin() {
  result = { status: 'pending' };
  void client!.start().then(value => { result = { status: 'attached', value }; },
    error => { result = { status: 'failed', error: String(error) }; });
}
const api = { boot, attach, begin, loadGameAction, reconcileGameAction,
  async reloadSession() { session?.stop(); session = new GameSession(() => {}); await session.start(); },
  hold(operation: string) { held = operation; entered = false; release = deferred<void>(); },
  release() { held = ''; release.resolve(); },
  status() { return { ...result, phase: client?.phase, held: entered }; },
  async secondStart() { try { await client!.start(); return 'unexpected'; } catch (error) { return String(error); } },
  async launch() { return (await readLaunch()).value; },
  async head() { return (await readCanonicalHead()).head; },
  async original(action: AgenticaAction) { return reconcileGameAction(action); },
  close() { client?.close(); }, stop() { client?.close(); session?.stop(); },
};
declare global { interface Window { canonicalTransport: typeof api } }
window.canonicalTransport = api;
