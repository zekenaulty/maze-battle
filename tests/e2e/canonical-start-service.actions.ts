import type { GameSession } from '../../src/services/game/GameSession';
import { AgenticaHost, actionKey, type AgenticaMessage } from '../../src/services/agentica/sdk/agentica-host.mjs';
import type { AgenticaAction, AgenticaResult } from '../../src/services/agentica/contracts';
import { prepareGameLaunch } from '../../src/services/agentica/game/launch';
import { createGameTransport } from '../../src/services/agentica/game/transport';
import { createGameOperationDriver } from '../../src/services/agentica/game/operationDriver';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { launchAcknowledgement } from '../../src/persistence/canonical/agentica/launch.ack';
import { prepareAction, readAction } from '../../src/persistence/canonical/agentica/actions';
import { readAgenticaOperation } from '../../src/persistence/canonical/agentica/operation';
import { readCanonical } from '../../src/persistence/canonical/read';

export async function startObservationSequence(session: GameSession) {
  const launch = await prepareGameLaunch(session, {
    endpoint: 'ws://127.0.0.1:5259/api/host', objectiveId: crypto.randomUUID(),
    objective: 'Inspect the earned map and room, observe, then admit navigation to an adjacent earned cell. No successor.',
    provider: { provider: 'fixture', model: 'observation-sequence', contextWindowTokens: 8192, maxOutputTokens: 256 },
    limits: { maxSteps: 4, maxRefinements: 3, maxPlanContinuations: 0, timeoutSeconds: 60, actionTimeoutSeconds: 10 },
  });
  const actions: AgenticaAction[] = [], results: AgenticaResult[] = [], messages: AgenticaMessage[] = [];
  const statuses: { state: string; detail?: unknown }[] = [];
  let sdk: AgenticaHost, replay: Promise<unknown> | undefined, retry: unknown;
  let driver: Awaited<ReturnType<typeof createGameOperationDriver>> | undefined;
  const client = await createGameTransport(session, launch.launchId, config => {
    sdk = new AgenticaHost({ ...config,
      async onAction(action) {
        if (actions.length >= 4) throw Error('The closed script cannot dispatch more than four actions.');
        actions.push(structuredClone(action));
        // Keep the socket attached until the exact first-result retry has a real service ACK.
        if (action.capabilityId === 'maze.navigate') {
          if (!replay) throw Error('The first result was not accepted before navigation.');
          await replay;
        }
        const result = await config.onAction(action); results.push(structuredClone(result)); return result;
      },
      onMessage(message) {
        if (messages.length >= 256) throw Error('Fixture message bound exceeded.');
        messages.push(structuredClone(message)); config.onMessage?.(message);
        if (!replay && message.type === 'action.accepted' && message.payload.duplicate === false
          && message.payload.actionId === actions[0]?.actionId) {
          replay = (async () => {
            const action = actions[0], key = actionKey(action), original = await config.loadAction(key);
            if (!original?.result) throw Error('Accepted result lacks the canonical original.');
            const reconciled = await config.reconcileAction!(action, original);
            // request is a public runtime SDK method; its general wire API is intentionally not in Maze's narrow declaration.
            const response = await (sdk as AgenticaHost & { request(type: string, payload: unknown,
              options: { runId: string }): Promise<AgenticaMessage> }).request('action.result', reconciled, { runId: action.runId });
            retry = { response, original: original.result, reconciled, after: await config.loadAction(key) };
            return retry;
          })();
          void replay.catch(error => { retry = { error: String(error) }; });
        }
      },
      onStatus(status) { statuses.push(structuredClone(status)); config.onStatus?.(status); },
    });
    return sdk;
  });
  const started = await client.start();
  const binding = { grant: (await readLaunch(launch.launchId)).value!.grant!.ref, publication: launch.publication };
  // Identity preparation uses crypto, so perform it outside the IndexedDB read transaction.
  async function originals() {
    const rows = [];
    for (const action of actions) {
      const identity = await prepareAction(action);
      rows.push((await readCanonical(p => readAction(p, identity))).value);
    }
    return rows;
  }
  return {
    started,
    async read() { return { started, initial: launch.start.observation, actions: structuredClone(actions), results: structuredClone(results),
      messages: structuredClone(messages), statuses: structuredClone(statuses), retry: structuredClone(retry), originals: await originals() }; },
    async pulse() {
      const action = actions.find(a => a.capabilityId === 'maze.navigate');
      if (!action) throw Error('No native navigation action received.');
      driver ??= await createGameOperationDriver(session, sdk!, action, binding);
      const result = await driver.pulse();
      return { result, state: (await readAgenticaOperation(await prepareAction(action))).value };
    },
    async cancel() { if (!driver) throw Error('No operation driver.'); await driver.cancel(); },
    async stopStart() {
      const retained = (await readLaunch(launch.launchId)).value!;
      if (retained.guard.terminal?.disposition !== 'cancelled') throw Error('Stop local authority first.');
      const key = { hostId: launch.start.hostId, sessionId: launch.start.sessionId, attemptId: retained.dispatch!.source.attemptId };
      const original = await sdk!.getStart(key);
      const remote = await sdk!.stopStart({ ...key, runId: original.runId, acceptedRequestHash: original.acceptedRequestHash });
      if (!remote.terminal) return { settled: false, remote };
      const proof = launchAcknowledgement(launch.launchId, remote);
      await session.cleanupHostOperation({ kind: 'verified-ack', ...await proof.prepare(), verify: proof.verify }, session.hostSignal);
      return { settled: true, remote, guard: (await readLaunch(launch.launchId)).value!.guard.state };
    },
    close() { driver?.close(); client.close(); },
  };
}
