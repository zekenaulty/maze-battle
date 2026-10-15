import type { GameSession } from '../../src/services/game/GameSession';
import { prepareGameLaunch } from '../../src/services/agentica/game/launch';
import { createGameTransport } from '../../src/services/agentica/game/transport';
import { createGameOperationDriver } from '../../src/services/agentica/game/operationDriver';
import { publishGamePublication } from '../../src/services/agentica/game/publication';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { decisionSdkCapture } from './canonical-start-service.decision-log';
import { decisionState } from './canonical-start-service.decision-state';

export type DecisionScriptMode = 'navigation' | 'terminal';
export async function startDecisionSequence(session: GameSession, mode: DecisionScriptMode) {
  const capture = decisionSdkCapture();
  const launch = await prepareGameLaunch(session, {
    endpoint: 'ws://127.0.0.1:5259/api/host', objectiveId: crypto.randomUUID(),
    objective: 'Execute one earned navigation, await an explicit host decision, then one bounded successor window.',
    provider: { provider: 'fixture', model: `decision-${mode}`, contextWindowTokens: 8192, maxOutputTokens: 256 },
    limits: { maxSteps: 8, maxRefinements: 6, maxPlanContinuations: 1, timeoutSeconds: 90, actionTimeoutSeconds: 20 },
  });
  const transport = await createGameTransport(session, launch.launchId, capture.factory('initial'));
  const started = await transport.start(), sdk = capture.latest();
  const binding = { grant: (await readLaunch(launch.launchId)).value!.grant!.ref, publication: launch.publication };
  let driver: Awaited<ReturnType<typeof createGameOperationDriver>> | undefined;
  const action = () => {
    const found = capture.read().actions.find(a => a.window === 'initial' && a.action.capabilityId === 'maze.navigate');
    if (!found) throw Error('No real initial navigation action received'); return found.action;
  };
  return { started, binding, capture, action,
    async read() {
      const log = capture.read();
      return { started, binding, ...log, ...await decisionState(launch.launchId, binding, log) };
    },
    async pulseNavigation() {
      driver ??= await createGameOperationDriver(session, sdk, action(), binding);
      return driver.pulse();
    },
    publication: () => publishGamePublication(session),
    detachNavigation() { driver?.close(); driver = undefined; },
    close() { driver?.close(); transport.close(); capture.close(); },
  };
}
