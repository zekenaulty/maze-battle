import { readCanonical } from '../read';
import { fields } from '../roster/codec';
import type { OwnerFence } from '../types';
import { check, fence, sameFence } from '../validation';
import { loadDecisionClaim } from './decision.claim';
import { loadDecisionIntent } from './decision.records';
import { captureOperationBinding, loadOperationBinding } from './operation.binding';
import { recoveryOperationId, recoveryOriginal, recoveryPointers } from './recovery.records';
import type { RecoveryCandidate } from './recovery.types';
import { loadAgenticaTerminal } from './terminal';
import { equal, snapshotJson, snapshotReference } from './validation';
import { inRecoveryDatabase } from './recovery.database';

/** Inspect exactly one listed original at the inventory fence. This never refreshes or grants authority. */
export async function inspectAgenticaRecovery(inputFence: OwnerFence, input: RecoveryCandidate, options: { signal?: AbortSignal } = {}) {
  const expected = snapshotJson(inputFence); fence(expected);
  fields(input, 'operationId original binding');
  const candidate = { operationId: input.operationId, original: snapshotReference(input.original), binding: captureOperationBinding(input.binding) };
  check(candidate.operationId === recoveryOperationId(candidate.original.key), 'recovery operation identity changed');
  return inRecoveryDatabase(options.signal, signal => inspectOriginal(expected, candidate, signal));
}

async function inspectOriginal(expected: OwnerFence, candidate: RecoveryCandidate, signal: AbortSignal) {
  const view = await readCanonical(async pages => {
    const { identity, candidate: original } = await recoveryOriginal(pages, candidate.original);
    check(equal(candidate, original), 'recovery original binding changed');
    const bound = await loadOperationBinding(pages, identity, original.binding);
    check(bound.operation.id === candidate.operationId, 'recovery original operation changed');
    const pointers = await recoveryPointers(pages);
    check(bound.operation.state !== 'acknowledged' || equal(pointers.selected?.predecessor, candidate), 'recovery candidate is no longer listed');
    // The public terminal reader validates historical ACK proof at its committed revision cut.
    const terminal = await loadAgenticaTerminal(pages, identity, original.binding);
    const claim = await loadDecisionClaim(pages, identity);
    const decision = claim?.decision ?? await loadDecisionIntent(pages, identity, bound);
    check(!decision || equal(decision.data.binding, original.binding), 'recovery decision binding changed');
    const acknowledgement = bound.operation.acknowledgementAttemptId
      ? await pages.sourceReceipt(bound.operation.acknowledgementAttemptId) : null;
    return { fence: expected, candidate: original, action: structuredClone(identity.action), result: bound.result,
      launchId: bound.launch.binding.launchId, operation: bound.operation, progress: bound.progress,
      terminal: terminal ? { event: terminal.event, source: terminal.terminal.terminal.source, receipt: terminal.terminal.terminal.receipt } : null,
      acknowledgement, decision: decision ? { reference: decision.reference, data: decision.data, source: decision.source } : null,
      claim: claim ? { reference: claim.reference, data: claim.data, source: claim.source } : null,
      pendingRemoteActions: 'unknown' as const, sessionClear: 'unknown' as const };
  }, { signal });
  check(sameFence(expected, view.head), 'recovery inspection fence changed');
  return { ...view.value, stats: view.stats };
}
