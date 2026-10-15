import type { GameSession } from '../../src/services/game/GameSession';
import { createGameDecisionController } from '../../src/services/agentica/game/decisionController';
import { createGameOperationDriver } from '../../src/services/agentica/game/operationDriver';
import { createGrantedLaunchRecovery } from '../../src/services/agentica/game/launchRecovery';
import { prepareAction } from '../../src/persistence/canonical/agentica/actions';
import { readAgenticaOperation } from '../../src/persistence/canonical/agentica/operation';
import { readAgenticaTerminal } from '../../src/persistence/canonical/agentica/terminal';
import type { startDecisionSequence } from './canonical-start-service.decision-script';

export type DecisionAttachment = Pick<Awaited<ReturnType<typeof startDecisionSequence>>,
  'action' | 'binding' | 'capture' | 'started' | 'publication'> & { launchId: string };

export async function attachDecisionController(session: GameSession, script: DecisionAttachment) {
  const controller = await createGameDecisionController(session, script.action(), script.binding,
    { factory: script.capture.factory('successor') });
  const sdk = script.capture.latest();
  let driver: Awaited<ReturnType<typeof createGameOperationDriver>> | undefined;
  let recovery: Awaited<ReturnType<typeof createGrantedLaunchRecovery>> | undefined;
  const action = () => script.capture.read().actions.find(item => item.window === 'successor' && item.action.capabilityId === 'maze.navigate')?.action;
  async function successorDriver() {
    const navigation = action(), binding = controller.binding;
    if (!navigation || !binding) throw Error('Need actual successor navigation and the controller grant');
    return driver ??= await createGameOperationDriver(session, sdk, navigation, binding);
  }
  return {
    async prepare() {
      const publication = await script.publication();
      return { publication, intent: await controller.prepare(publication) };
    },
    pulse: () => controller.pulse(), acknowledge: () => controller.acknowledge(), cancel: () => controller.cancel(),
    pulseNavigation: async () => (await successorDriver()).pulse(),
    cancelNavigation: async () => (await successorDriver()).cancel(),
    async read() {
      const navigation = action(), binding = controller.binding, log = script.capture.read();
      const admitted = navigation && binding && log.results.some(item => item.result.actionId === navigation.actionId && item.result.operation);
      const identity = admitted ? await prepareAction(navigation) : null;
      return { phase: controller.phase, connected: sdk.connected, binding, action: navigation,
        operation: identity ? (await readAgenticaOperation(identity)).value : null,
        terminal: identity ? (await readAgenticaTerminal(identity, binding!)).value : null };
    },
    remote: () => sdk.listOperations({ hostId: 'maze-battle', sessionId: script.started.sessionId }),
    async inspectRoot() {
      recovery ??= await createGrantedLaunchRecovery(session, script.launchId);
      return recovery.inspect();
    },
    async stopRoot() {
      recovery ??= await createGrantedLaunchRecovery(session, script.launchId);
      return recovery.stop();
    },
    close() { recovery?.close(); driver?.close(); controller.close(); },
  };
}
