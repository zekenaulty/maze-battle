import { readCanonical } from '../../src/persistence/canonical/read';
import type { CanonicalOperation } from '../../src/persistence/canonical/types';
import type { startDecisionSequence } from './canonical-start-service.decision-script';

/** Original canonical source receipts only; this helper cannot submit or manufacture an ACK. */
export async function decisionStopEvidence(script: Awaited<ReturnType<typeof startDecisionSequence>>) {
  const state = await script.read();
  return (await readCanonical(async pages => {
    async function evidence(operation: CanonicalOperation) {
      return { operation,
        terminal: operation.terminal ? await pages.sourceReceipt(operation.terminal.attemptId) : null,
        acknowledgement: operation.acknowledgementAttemptId
          ? await pages.sourceReceipt(operation.acknowledgementAttemptId) : null };
    }
    return { navigation: await evidence(state.operation!.operation), root: await evidence(state.launch!.guard) };
  })).value;
}
