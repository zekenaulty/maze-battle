import type { GameSession } from '../../src/services/game/GameSession';
import { publishGamePublication } from '../../src/services/agentica/game/publication';
import { prepareAction, readAction } from '../../src/persistence/canonical/agentica/actions';
import { captureOperationBinding } from '../../src/persistence/canonical/agentica/operation.binding';
import { loadAgenticaTerminal } from '../../src/persistence/canonical/agentica/terminal';
import { loadRunGrant } from '../../src/persistence/canonical/agentica/run-grant.read';
import { reference as assertReference, snapshotReference } from '../../src/persistence/canonical/agentica/validation';
import type { PendingAction, ProtocolRef } from '../../src/persistence/canonical/agentica/types';
import { readCanonical } from '../../src/persistence/canonical/read';
import { fields } from '../../src/persistence/canonical/roster/codec';
import { decisionSdkCapture } from './canonical-start-service.decision-log';
import { decisionState } from './canonical-start-service.decision-state';

/** Only a record locator crosses reload. Action, binding and start are reread and validated from IndexedDB. */
export async function restoreDecisionSequence(session: GameSession, input: ProtocolRef) {
  const reference = snapshotReference(input);
  const row = (await readCanonical(pages => pages.get('execution', reference.key))).value;
  if (!row || row.id !== reference.id) throw Error('Missing exact retained navigation record');
  const identity = await prepareAction((row.value as unknown as PendingAction).action);
  if (identity.storageKey !== reference.key) throw Error('Retained navigation locator changed');
  const { binding, started, launchId } = (await readCanonical(async pages => {
    const original = await readAction(pages, identity);
    if (!original || original.reference.id !== reference.id) throw Error('Retained navigation identity changed');
    const reserved = fields(original.original.sourceRequest.input, 'action grant publication');
    assertReference(reserved.grant); assertReference(reserved.publication);
    const binding = captureOperationBinding({ grant: snapshotReference(reserved.grant), publication: snapshotReference(reserved.publication) });
    const terminal = await loadAgenticaTerminal(pages, identity, binding);
    if (terminal?.event.kind !== 'decision') throw Error('Reload requires completed canonical navigation');
    const grant = await loadRunGrant(pages, binding.grant);
    return { binding, started: grant.started, launchId: grant.launch.binding.launchId };
  })).value;
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
