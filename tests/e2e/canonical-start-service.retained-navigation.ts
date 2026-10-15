import { prepareAction, readAction } from '../../src/persistence/canonical/agentica/actions';
import { captureOperationBinding, loadOperationBinding } from '../../src/persistence/canonical/agentica/operation.binding';
import { loadRunGrant } from '../../src/persistence/canonical/agentica/run-grant.read';
import { reference as assertReference, snapshotReference } from '../../src/persistence/canonical/agentica/validation';
import type { PendingAction, ProtocolRef } from '../../src/persistence/canonical/agentica/types';
import { readCanonical } from '../../src/persistence/canonical/read';
import { fields } from '../../src/persistence/canonical/roster/codec';

/** The locator is not authority. Canonical readers validate the exact original admission and grant. */
export async function retainedNavigation(input: ProtocolRef) {
  const reference = snapshotReference(input);
  const row = (await readCanonical(pages => pages.get('execution', reference.key))).value;
  if (!row || row.id !== reference.id) throw Error('Missing exact retained navigation record');
  const identity = await prepareAction((row.value as unknown as PendingAction).action);
  if (identity.storageKey !== reference.key) throw Error('Retained navigation locator changed');
  const context = (await readCanonical(async pages => {
    const original = await readAction(pages, identity);
    if (!original || original.reference.id !== reference.id) throw Error('Retained navigation identity changed');
    const reserved = fields(original.original.sourceRequest.input, 'action grant publication');
    assertReference(reserved.grant); assertReference(reserved.publication);
    const binding = captureOperationBinding({ grant: reserved.grant, publication: reserved.publication });
    const grant = await loadRunGrant(pages, binding.grant);
    const bound = await loadOperationBinding(pages, identity, binding, grant);
    return { binding, started: grant.started, launchId: grant.launch.binding.launchId, bound };
  })).value;
  return { identity, ...context };
}
