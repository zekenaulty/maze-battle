import type { AgenticaAction } from '../../src/services/agentica/contracts';
import type { AgenticaOperationEntry } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { prepareAction } from '../../src/persistence/canonical/agentica/actions';
import { interactionProgressHooks, readAgenticaOperation, retainEventAcknowledgement } from '../../src/persistence/canonical/agentica/operation';
import { executeInteractionCommand } from '../../src/persistence/canonical/interaction/commands';
import { executeCanonical, operateCanonical } from '../../src/persistence/canonical/transaction';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import type { CanonicalRequest } from '../../src/persistence/canonical/types';
import { json } from '../../src/persistence/canonical/world/records';
import { worldRequest } from './canonical-world-fixture';

export { executeInteractionCommand, operateCanonical };
export async function command(operation: string, input: unknown) {
  return worldRequest((await readCanonicalHead()).head, operation, json(input));
}
export async function applyRequest(operationId: string) { return command('interaction.apply', { operationId, sequence: 0 }); }
export async function apply(original: AgenticaAction, request: CanonicalRequest, failAfterEvent = false, seen: unknown[] = []) {
  const identity = await prepareAction(original), state = (await readAgenticaOperation(identity)).value!;
  const hooks = interactionProgressHooks(identity, state.confirmation.reference);
  return executeInteractionCommand(request, { host: { prepare: hooks.prepare, async commit(view) {
    const refs = await hooks.commit(view);
    seen.push({ refs, progress: view.progress, checkpoint: view.checkpoint });
    if (failAfterEvent) throw Error('fixture failure after actual interaction event');
    return refs;
  } } });
}
export async function acknowledgeProgress(original: AgenticaAction, entry: AgenticaOperationEntry) {
  const identity = await prepareAction(original), state = (await readAgenticaOperation(identity)).value!;
  const event = state.event!.reference, request = await command('agentica.operation.ack', { action: identity.storageKey, event, entry });
  return executeCanonical(request, async tx => (await retainEventAcknowledgement(tx, request, identity, event, entry)).receipt);
}
export async function identityAndProof(original: AgenticaAction) {
  const identity = await prepareAction(original);
  return { identity, operationId: `interact-${identity.storageKey.slice(-64)}`,
    proof: (await readCanonical(p => p.get('execution', `${identity.storageKey}/result`))).value };
}
export async function live(operationId: string) { return (await readCanonical(p => p.liveOperation(operationId))).value; }
