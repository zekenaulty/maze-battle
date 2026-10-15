import type { GameSession } from '../../src/services/game/GameSession';
import { publishGamePublication } from '../../src/services/agentica/game/publication';
import { loadAgenticaTerminal } from '../../src/persistence/canonical/agentica/terminal';
import type { ProtocolRef } from '../../src/persistence/canonical/agentica/types';
import { readCanonical } from '../../src/persistence/canonical/read';
import { decisionSdkCapture } from './canonical-start-service.decision-log';
import { decisionState } from './canonical-start-service.decision-state';
import { retainedNavigation } from './canonical-start-service.retained-navigation';

/** Only a record locator crosses reload. Action, binding and start are reread and validated from IndexedDB. */
export async function restoreDecisionSequence(session: GameSession, input: ProtocolRef) {
  const { identity, binding, started, launchId } = await retainedNavigation(input);
  const terminal = (await readCanonical(pages => loadAgenticaTerminal(pages, identity, binding))).value;
  if (terminal?.event.kind !== 'decision') throw Error('Reload requires completed canonical navigation');
  const capture = decisionSdkCapture();
  return { binding, started, launchId, capture, action: () => structuredClone(identity.action),
    publication: () => publishGamePublication(session),
    async read() {
      const log = capture.read();
      return { started, binding, ...log, ...await decisionState(launchId, binding, log, identity) };
    },
    close: () => capture.close(),
  };
}
