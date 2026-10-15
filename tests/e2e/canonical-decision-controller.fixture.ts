import { seedCompletedController } from './canonical-decision-controller.setup';
import { controllerState } from './canonical-decision-controller.state';
import { DecisionRemote } from './canonical-decision-controller.remote';
import { DecisionSdkFixture } from './canonical-decision-controller.sdk';
import { dump, fillQuota } from './canonical-decision-ack.storage';
import { publishGamePublication } from '../../src/services/agentica/game/publication';
import { createGameDecisionController } from '../../src/services/agentica/game/decisionController';
import type { ProtocolRef } from '../../src/persistence/canonical/agentica/types';
import type { AgenticaAction } from '../../src/services/agentica/contracts';
import { ControllerPort } from './canonical-decision-controller.port';
import { ControllerJobs } from './canonical-decision-controller.jobs';
import { completedReplay, draftSuccessor, pendingSave, retainedAction } from './canonical-decision-controller.actions';
import type { BarrierPoint } from './canonical-decision-controller.barriers';
import type { SettledState } from './canonical-decision-controller.remote';
import type { LaunchStarted } from '../../src/persistence/canonical/agentica/launch.types';
import { GameSession } from '../../src/services/game/GameSession';
import type { TransferSeed } from './canonical-operation-transfer.setup';
import type { RemoteSnapshot } from './canonical-decision-controller.remote';
import type { AgenticaOperationEntry } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { holdNextCanonicalRead } from './canonical-decision-controller.read-barrier';
import { moveControllerSuccessor } from './canonical-decision-controller.navigation';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5266') throw Error('Isolated decision controller fixture only');
let seeded: { session: GameSession; seed: TransferSeed; started: LaunchStarted; entry: AgenticaOperationEntry }, sdk: DecisionSdkFixture;
let port: ControllerPort, controller: Awaited<ReturnType<typeof createGameDecisionController>>;
const jobs = new ControllerJobs();
const controllers: Awaited<ReturnType<typeof createGameDecisionController>>[] = [];
let restoreReadBarrier = () => {};
async function boot() {
  seeded = await seedCompletedController();
  initialize({ entry: seeded.entry, started: seeded.started, wakeIdentity: null, activations: 0 }); return seeded.seed;
}
function initialize(remote: RemoteSnapshot) {
  sdk = new DecisionSdkFixture(new DecisionRemote(remote),
    async () => {
      const state = await controllerState(seeded.seed);
      return { head: state.head, intent: state.intent, claim: state.claim, grant: state.grant?.record.ref ?? null,
        selection: state.selection, guard: state.launch.guard, operation: state.operation };
    });
  port = new ControllerPort(seeded.session, sdk.barriers);
}
function control() { return { phase: controller.phase, binding: controller.binding ?? null }; }
async function create() {
  controller = await createGameDecisionController(port, seeded.seed.action, seeded.seed.binding, { factory: sdk.factory,
    fetchImpl: async () => { throw Error('Unexpected real controller HTTP'); } }); controllers.push(controller); return control();
}
function begin(command: 'pulse' | 'ack' | 'cancel' | 'save' | 'action', input?: AgenticaAction) {
  const action = input && structuredClone(input);
  return jobs.begin(async () => {
    if (command === 'pulse') return controller.pulse();
    if (command === 'ack') return controller.acknowledge();
    if (command === 'cancel') return controller.cancel();
    if (!action) throw Error('Missing fixture action');
    return command === 'save' ? pendingSave(sdk, action) : sdk.options.at(-1)!.onAction(action);
  });
}
const api = { boot, dump, fillQuota, state: () => controllerState(seeded.seed), publish: () => publishGamePublication(seeded.session),
  create, control, prepare: (publication: ProtocolRef) => controller.prepare(publication), pulse: () => controller.pulse(),
  acknowledge: () => controller.acknowledge(), close: () => controller.close(),
  acknowledgePrevious: () => controllers.at(-2)!.acknowledge(),
  begin, job: (id: number) => jobs.result(id), wait: (id: number) => jobs.wait(id),
  hold: (point: BarrierPoint) => sdk.barriers.hold(point), entered: (point: BarrierPoint) => sdk.barriers.entered(point),
  release: (point: BarrierPoint) => sdk.barriers.release(point),
  holdPrewakeRead: () => { restoreReadBarrier = holdNextCanonicalRead(sdk.barriers); },
  disconnect: () => sdk.options.at(-1)!.onStatus?.({ state: 'disconnected' }),
  draft: () => draftSuccessor(seeded.session, seeded.seed, sdk), retained: retainedAction,
  moveSuccessor: (action: AgenticaAction) => moveControllerSuccessor(seeded.session, seeded.seed, sdk, action),
  replay: (forged = false) => completedReplay(sdk, seeded.seed.action, forged),
  hostCalls: () => structuredClone(port.calls),
  failNext: (stage: 'grant' | 'cleanup') => { port.failNextStage = stage; },
  configure(input: { fastState?: SettledState; loseWakeReply?: boolean; replyPatch?: Partial<LaunchStarted>; unavailable?: boolean }) {
    Object.assign(sdk.remote, structuredClone(input));
  },
  corruptRemote(kind: 'run' | 'provider' | 'usage' | 'event' | 'action') {
    if (kind === 'run') sdk.remote.entry.wakeRunId = crypto.randomUUID();
    if (kind === 'provider') sdk.remote.entry.request.provider.model = 'foreign-model';
    if (kind === 'usage') sdk.remote.entry.usage.providerCalls++;
    if (kind === 'event') sdk.remote.entry.latestEvent!.summary += ' changed';
    if (kind === 'action') sdk.remote.entry.action.actionId = crypto.randomUUID();
  },
  replaceRemoteEntry: (entry: AgenticaOperationEntry) => { sdk.remote.entry = structuredClone(entry); },
  changeWorld: () => seeded.session.execute('settings', { kind: 'throttle', ms: 700 }),
  endLifetime: () => seeded.session.stop(),
  snapshot: () => JSON.stringify({ seed: seeded.seed, remote: sdk.remote.snapshot() }),
  restore(snapshot: string) {
    const saved = JSON.parse(snapshot) as { seed: TransferSeed; remote: RemoteSnapshot };
    seeded = { session: new GameSession(() => {}), seed: saved.seed, started: saved.remote.started, entry: saved.remote.entry };
    initialize(saved.remote);
  },
  startSession: () => seeded.session.start(),
  async rewindPrefix() { sdk.remote.entry.latestEvent = structuredClone((await controllerState(seeded.seed)).prefix.predecessor!); },
  settle: (state: SettledState) => sdk.remote.settle(state),
  emitTerminal: () => sdk.emit({ protocolVersion: 1, type: 'outcome', runId: sdk.remote.started.runId, payload: { status: sdk.remote.entry.state } }),
  remote: () => sdk.remote.snapshot(), calls: () => structuredClone(sdk.calls),
  stop: () => { restoreReadBarrier(); for (const item of controllers) item.close(); sdk?.barriers.releaseAll(); seeded?.session.stop(); } };
declare global { interface Window { canonicalDecisionController: typeof api } }
window.canonicalDecisionController = api;
