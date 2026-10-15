import type { CanonicalHostPort } from '../../game/CanonicalHostCommand';
import { executeCanonical } from '../../../persistence/canonical/transaction';
import type { JsonObject } from '../../../persistence/canonical/types';
import { retainPublication } from '../../../persistence/canonical/agentica/publication';
import { executePublicationRenewal, type PublicationSelectionInput } from '../../../persistence/canonical/agentica/publication-selection';
import { snapshotJson, snapshotReference } from '../../../persistence/canonical/agentica/validation';
import type { ProtocolRef } from '../../../persistence/canonical/agentica/types';

/** Retention only: no look, selection, network, or new execution authority. */
export async function publishGamePublication(port: CanonicalHostPort) {
  const signal = port.hostSignal; signal.throwIfAborted();
  const receipt = await port.submitHostCommand({ kind: 'fresh', signal, operation: 'agentica.publish', input: {},
    execute: (request, options) => executeCanonical(request, async tx => (await retainPublication(tx, request)).receipt, options) });
  signal.throwIfAborted();
  return snapshotReference((receipt.result as JsonObject).reference as unknown as ProtocolRef);
}
/** Explicit initial-run selection. Existing action-hook bindings are never updated in place. */
export function renewGamePublication(port: CanonicalHostPort, input: PublicationSelectionInput) {
  const captured = snapshotJson(input), signal = port.hostSignal; signal.throwIfAborted();
  return port.submitHostCommand({ kind: 'fresh', signal, operation: 'agentica.publication.renew',
    input: captured as unknown as JsonObject, execute: executePublicationRenewal });
}
