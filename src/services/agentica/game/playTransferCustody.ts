import { readCanonical } from '../../../persistence/canonical/read';
import { loadOperationEvent } from '../../../persistence/canonical/agentica/event.records';
import { loadTransferAuthority, transferStageKey } from '../../../persistence/canonical/agentica/transfer.records';
import { equal } from '../../../persistence/canonical/agentica/validation';
import { check, sameFence } from '../../../persistence/canonical/validation';
import type { DecisionView } from './decisionState';

/** Settled custody is proved by the final progress/terminal chain, not admitted-operation authority. */
export async function assertTransferredDecision(view: DecisionView) {
  const { terminal } = view.value, { bound, confirmed, transfer } = terminal;
  const { operation, launch, progress } = bound, head = view.head;
  check(bound.kind === 'navigation' && confirmed && transfer && operation.state === 'settled'
    && terminal.event.kind === 'decision' && terminal.event.sessionEpoch === String(head.epoch)
    && Number(terminal.identity.action.sessionEpoch) < head.epoch
    && [operation, launch.guard, progress].every(v => v.owner === head.owner && v.epoch === head.epoch)
    && launch.guard.state === 'admitted', 'decision requires current transferred navigation');
  const proof = await readCanonical(async pages => {
    const key = transferStageKey(transfer.reference, 'authority'), row = await pages.get('execution', key);
    check(row, 'transferred decision lacks authority');
    const authority = await loadTransferAuthority(pages, terminal.identity, confirmed, { key, id: row.id });
    const event = await loadOperationEvent(pages, terminal.identity, confirmed, progress.sequence);
    const settled = terminal.terminal.terminal;
    check(equal(authority.transfer.reference, transfer.reference) && equal(event.data.authority, authority.reference)
      && authority.source.expected.owner === head.owner && authority.source.expected.epoch === head.epoch
      && launch.guard.revision === authority.data.guardRevision
      && progress.sequence > transfer.data.navigationSequence && event.source.attemptId === progress.sourceAttemptId
      && settled.source.expected.owner === head.owner && settled.source.expected.epoch === head.epoch
      && settled.receipt.beforeRevision >= event.row.revision && event.row.revision > authority.row.revision
      && operation.revision === settled.receipt.afterRevision, 'transferred decision chain changed');
  });
  check(sameFence(proof.head, head), 'transferred decision fence changed');
}
