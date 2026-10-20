import type { AgenticaAction } from '../../src/services/agentica/contracts';
import { prepareAction } from '../../src/persistence/canonical/agentica/actions';
import { loadOriginalAction } from '../../src/persistence/canonical/agentica/actions.original';
import { readAgenticaOperation } from '../../src/persistence/canonical/agentica/operation';
import { readAgenticaTerminal } from '../../src/persistence/canonical/agentica/terminal';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { readCanonical } from '../../src/persistence/canonical/read';
import { reference, snapshotReference } from '../../src/persistence/canonical/agentica/validation';
import { fields } from '../../src/persistence/canonical/roster/codec';

/** Independent exact-original audit only. Never used for planner input or cleanup selection. */
export async function corpusCustody(action: AgenticaAction) {
  const identity = await prepareAction(action), root = (await readLaunch()).value!;
  const original = (await readCanonical(pages => loadOriginalAction(pages, identity))).value!;
  const input = fields(original.original.sourceRequest.input, 'action grant publication');
  reference(input.grant); const grant = snapshotReference(input.grant);
  const binding = { grant, publication: original.original.publication };
  const operation = (await readAgenticaOperation(identity)).value!;
  const terminal = (await readAgenticaTerminal(identity, binding)).value!;
  const acknowledgements = (await readCanonical(async pages => ({
    operation: operation.operation.acknowledgementAttemptId
      ? await pages.sourceReceipt(operation.operation.acknowledgementAttemptId) : null,
    root: root.guard.acknowledgementAttemptId ? await pages.sourceReceipt(root.guard.acknowledgementAttemptId) : null,
  }))).value;
  return { root, original, binding, operation, terminal, acknowledgements };
}
