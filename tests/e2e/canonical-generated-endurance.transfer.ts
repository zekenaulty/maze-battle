import type { AgenticaAction } from '../../src/services/agentica/contracts';
import { AgenticaHost } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { createGameOperationDriver } from '../../src/services/agentica/game/operationDriver';
import { operateCanonical } from '../../src/persistence/canonical/transaction';
import { activeJourneyEvidence } from './canonical-start-service.active-journey-evidence';
import { createControllerRootRecovery } from './canonical-decision-controller.root';
import { session } from './canonical-revisit.fixture';
import { audit } from './canonical-generated-endurance.fixture';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5474') throw Error('Isolated generated transfer fixture only');
export const proof = activeJourneyEvidence;

export async function cleanup(action: AgenticaAction) {
  const original = await proof(action), s = session();
  let forbiddenCalls = 0;
  const forbidden = async () => { forbiddenCalls++; throw Error('Transfer cleanup cannot invoke cognition or actions'); };
  const sdk = new AgenticaHost({ url: original.root.binding.endpoint, onAction: forbidden, loadAction: forbidden, saveAction: forbidden });
  const driver = await createGameOperationDriver(s, sdk, action, original.binding), pulses = [];
  try {
    await driver.cancel();
    for (let n = 0; n < 8; n++) {
      const result = await driver.pulse(); pulses.push(result);
      if (result.status === 'terminal-acknowledged') break;
      if (n === 7) throw Error('Transferred child cleanup exceeded eight pulses');
    }
    const root = createControllerRootRecovery(s, original.root.guard.id), stopped = await root.stop(), entry = await root.entry();
    entry.terminal!.usage = { ...original.operation.confirmation!.data.entry.usage };
    const acknowledged = await root.acknowledge(entry);
    return { pulses, stopped, acknowledged, state: await root.state(), forbiddenCalls };
  } finally { driver.close(); sdk.close(); }
}

/** Replay the two actual adoption requests after settlement, without manufacturing a request or owner. */
export async function replayAdoptions(action: AgenticaAction) {
  const retained = await proof(action);
  if (!retained.adoptions) throw Error('Missing named adoptions');
  const before = await audit(), guard = await operateCanonical(retained.adoptions.guard.source, 'adopt');
  const navigation = await operateCanonical(retained.adoptions.navigation.source, 'adopt');
  return { before, guard, navigation, after: await audit() };
}
