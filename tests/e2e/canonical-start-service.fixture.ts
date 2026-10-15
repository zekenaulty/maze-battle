import { GameSession } from '../../src/services/game/GameSession';
import { AgenticaHost, type HostStartKey } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { prepareGameLaunch, type GameLaunchOptions } from '../../src/services/agentica/game/launch';
import { createGameTransport } from '../../src/services/agentica/game/transport';
import { createLaunchRecovery } from '../../src/services/agentica/game/launchRecovery';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import type { ProtocolRef } from '../../src/persistence/canonical/agentica/types';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { startObservationSequence } from './canonical-start-service.actions';
import { attachServiceTransfer } from './canonical-start-service.transfer';
import { startDecisionSequence, type DecisionScriptMode } from './canonical-start-service.decision-script';
import { attachDecisionController } from './canonical-start-service.decision-control';
import { decisionStopEvidence } from './canonical-start-service.decision-evidence';
import { restoreDecisionSequence } from './canonical-start-service.decision-restore';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5258') throw Error('Isolated start-service origin required');
let session: GameSession;
let client: Awaited<ReturnType<typeof createGameTransport>> | undefined;
let recovery: Awaited<ReturnType<typeof createLaunchRecovery>> | undefined;
let scripted: Awaited<ReturnType<typeof startObservationSequence>> | undefined;
let transferred: Awaited<ReturnType<typeof attachServiceTransfer>> | undefined;
let decision: Awaited<ReturnType<typeof startDecisionSequence>> | undefined;
let restoredDecision: Awaited<ReturnType<typeof restoreDecisionSequence>> | undefined;
let controller: Awaited<ReturnType<typeof attachDecisionController>> | undefined;
let cleanupKinds: string[] = [], receivedReply: unknown;
const decisionSource = () => {
  const source = restoredDecision ?? decision;
  if (!source) throw Error('Start or reconstruct a canonical decision first');
  return source;
};
const options = (): GameLaunchOptions => ({
  endpoint: 'ws://127.0.0.1:5259/api/host', objectiveId: crypto.randomUUID(),
  objective: 'Wait for explicit cancellation. This fixture never produces actions.',
  provider: { provider: 'fixture', model: 'wait-only', contextWindowTokens: 8192, maxOutputTokens: 256 },
  limits: { maxSteps: 1, maxRefinements: 0, maxPlanContinuations: 0, timeoutSeconds: 120, actionTimeoutSeconds: 15 },
});
async function boot() {
  session = new GameSession(() => {}); await session.start();
  if (!session.view.controlled) throw Error(session.view.status);
  return (await readCanonicalHead()).head;
}
async function snapshot() {
  return { head: (await readCanonicalHead()).head, launch: (await readLaunch()).value, cleanupKinds: [...cleanupKinds] };
}
async function loseStart(beforeSend = false) {
  const launch = await prepareGameLaunch(session, options());
  client = await createGameTransport(session, launch.launchId, config => {
    const sdk = new AgenticaHost(config);
    return { connect: () => sdk.connect(), close: () => sdk.close(),
      async startDurable(input) {
        if (beforeSend) throw Error('Fixture failed before SDK send; absence remains unknown.');
        receivedReply = await sdk.startDurable(input);
        throw Error('Fixture discarded the real correlated durable-start reply.');
      } };
  });
  let error = '';
  try { await client.start(); } catch (e) { error = String(e); }
  const retained = (await readLaunch()).value!;
  const key: HostStartKey = { hostId: launch.start.hostId, sessionId: launch.start.sessionId, attemptId: retained.dispatch!.source.attemptId };
  return { error, key, receivedReply, ...await snapshot() };
}
async function recover(mode: 'inspect' | 'stop') {
  recovery ??= await createLaunchRecovery({
    get hostSignal() { return session.hostSignal; },
    submitHostCommand: session.submitHostCommand,
    cleanupHostOperation(command, signal) {
      cleanupKinds.push(command.kind);
      return session.cleanupHostOperation(command, signal);
    },
  }, (await readLaunch()).value!.binding.launchId);
  return recovery[mode]();
}
const api = { boot, loseStart, snapshot, recover,
  async startDecision(mode: DecisionScriptMode) { decision = await startDecisionSequence(session, mode); return decision.started; },
  async restoreDecision(reference: ProtocolRef) { restoredDecision = await restoreDecisionSequence(session, reference); },
  readDecision: () => decisionSource().read(), pulseDecisionNavigation: () => decision!.pulseNavigation(),
  readDecisionStopEvidence: () => decisionStopEvidence(decisionSource()),
  async readDecisionGuardAdoption() {
    const intent = (await decisionSource().read()).intent;
    if (!intent?.data.adoption) throw Error('Explicit adoption intent required');
    return (await readCanonical(pages => pages.sourceReceipt(`${intent.reference.id}:guard`))).value;
  },
  async attachDecisionController() {
    controller?.close(); decision?.detachNavigation(); decision?.closeInitialTransport();
    controller = await attachDecisionController(session, decisionSource());
  },
  prepareDecision: () => controller!.prepare(), pulseDecision: () => controller!.pulse(),
  acknowledgeDecision: () => controller!.acknowledge(), cancelDecision: () => controller!.cancel(),
  readDecisionController: () => controller!.read(), remoteDecision: () => controller!.remote(),
  pulseDecisionSuccessor: () => controller!.pulseNavigation(), cancelDecisionSuccessor: () => controller!.cancelNavigation(),
  stopDecisionRoot: () => controller!.stopRoot(), loseDecisionReply: () => decisionSource().capture.loseNextReply(),
  inspectDecisionRoot: () => controller!.inspectRoot(),
  decisionReplyAfterOutcome: () => decisionSource().capture.afterOutcome(),
  async attachTransfer(action: Parameters<typeof attachServiceTransfer>[1], binding: Parameters<typeof attachServiceTransfer>[2]) {
    transferred = await attachServiceTransfer(session, action, binding);
  },
  readTransfer: () => transferred!.read(), prepareTransfer: () => transferred!.prepare(), pulseTransfer: () => transferred!.pulse(),
  advanceTransfer: () => transferred!.advance(), cancelTransfer: () => transferred!.cancel(),
  remoteTransfer: () => transferred!.remote(), stopTransferStart: () => transferred!.stopStart(),
  async startScript() { scripted = await startObservationSequence(session); return scripted.started; },
  readScript: () => scripted!.read(),
  pulseScript: () => scripted!.pulse(),
  cancelScript: () => scripted!.cancel(),
  stopScriptStart: () => scripted!.stopStart(),
  async freshAdmission() {
    recovery?.close(); recovery = undefined;
    return prepareGameLaunch(session, options());
  },
  async replacementRefusal() {
    try { await prepareGameLaunch(session, options()); return ''; } catch (error) { return String(error); }
  },
  async fillQuota() {
    const { head } = await readCanonicalHead(), db = await openCanonicalDatabase();
    head.quota.limitBytes = head.quota.usedBytes + head.quota.reserveBytes + head.quota.reservedBytes;
    await db.put('heads', head, head.gameId); db.close();
    let refusal = '';
    try { await session.execute('settings', { kind: 'throttle', ms: 100 }); } catch (error) { refusal = String(error); }
    return { refusal, view: session.view, head: (await readCanonicalHead()).head };
  },
  stop() { controller?.close(); restoredDecision?.close(); decision?.close(); transferred?.close(); scripted?.close(); recovery?.close(); client?.close(); session?.stop(); },
};
window.addEventListener('pagehide', () => api.stop());
declare global { interface Window { canonicalStartService: typeof api } }
window.canonicalStartService = api;
