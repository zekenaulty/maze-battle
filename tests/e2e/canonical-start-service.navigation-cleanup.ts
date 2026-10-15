import type { GameSession } from '../../src/services/game/GameSession';
import { AgenticaHost } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { createGameOperationDriver } from '../../src/services/agentica/game/operationDriver';
import { readAgenticaTerminal } from '../../src/persistence/canonical/agentica/terminal';
import { loadOperationBinding } from '../../src/persistence/canonical/agentica/operation.binding';
import type { ProtocolRef } from '../../src/persistence/canonical/agentica/types';
import { readCanonical } from '../../src/persistence/canonical/read';
import { retainedNavigation } from './canonical-start-service.retained-navigation';

/** Historical cleanup only: no socket connection, transfer or action execution. */
export async function attachNavigationCleanup(session: GameSession, reference: ProtocolRef) {
  const { identity, binding } = await retainedNavigation(reference);
  const forbidden = async () => { throw Error('Reload cleanup cannot execute an action'); };
  const sdk = new AgenticaHost({ url: 'ws://127.0.0.1:5259/api/host', onAction: forbidden, loadAction: forbidden, saveAction: forbidden });
  const driver = await createGameOperationDriver(session, sdk, identity.action, binding);
  let cancelled = false;
  return {
    async cancel() { await driver.cancel(); cancelled = true; },
    async pulse() {
      if (!cancelled) throw Error('Explicit local cancellation required before historical delivery');
      return driver.pulse();
    },
    async read() {
      const { value: bound, head } = await readCanonical(pages => loadOperationBinding(pages, identity, binding));
      return { head, binding, original: bound.original, operation: bound.operation, progress: bound.progress,
        terminal: (await readAgenticaTerminal(identity, binding)).value };
    },
    close() { driver.close(); sdk.close(); },
  };
}
