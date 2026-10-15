import { GameSession } from '../../src/services/game/GameSession';
import { AgenticaHost, type HostStartKey } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { prepareGameLaunch, type GameLaunchOptions } from '../../src/services/agentica/game/launch';
import { createGameTransport } from '../../src/services/agentica/game/transport';
import { createLaunchRecovery } from '../../src/services/agentica/game/launchRecovery';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { readCanonicalHead } from '../../src/persistence/canonical/read';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5258') throw Error('Isolated start-service origin required');
let session: GameSession;
let client: Awaited<ReturnType<typeof createGameTransport>> | undefined;
let recovery: Awaited<ReturnType<typeof createLaunchRecovery>> | undefined;
let cleanupKinds: string[] = [], receivedReply: unknown;
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
  stop() { recovery?.close(); client?.close(); session?.stop(); },
};
window.addEventListener('pagehide', () => api.stop());
declare global { interface Window { canonicalStartService: typeof api } }
window.canonicalStartService = api;
