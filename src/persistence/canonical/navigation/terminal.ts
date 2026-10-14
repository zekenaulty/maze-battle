import { readCanonical, type CanonicalQuery } from '../read';
import { check } from '../validation';
import { fields } from '../roster/codec';
import { same } from '../world/records';
import { destinationKey, loadDestination } from './records';
import { navigationReceiptRef } from './host';

/** Stable terminal inputs only. No current clock, owner observation, outbox write or synthetic event ID. */
export async function loadDestinationTerminal(pages: Pick<CanonicalQuery, 'get' | 'sourceReceipt' | 'liveOperation'>, id: string) {
  destinationKey(id);
  const operation = await pages.liveOperation(id); check(operation?.terminal, 'destination has no terminal receipt');
  const progress = await loadDestination(pages, operation), disposition = operation.terminal.disposition;
  check(disposition === 'cancelled' || disposition === (progress.status === 'arrived' ? 'completed'
    : progress.status === 'blocked' ? 'blocked' : null), 'destination terminal disagrees with progress');
  const admission = await pages.sourceReceipt(operation.admissionAttemptId);
  const progressSource = await pages.sourceReceipt(progress.sourceAttemptId);
  const terminal = await pages.sourceReceipt(operation.terminal.attemptId);
  check(progressSource.receipt.afterRevision <= terminal.receipt.beforeRevision, 'progress is newer than terminal');
  if (disposition === 'cancelled') check(terminal.source.operation === 'operation.cancel'
    && same(terminal.receipt.result, { operationId: id, phase: 'cancel' }), 'invalid cancellation source');
  else {
    const result = fields(terminal.receipt.result, 'operationId status reason sequence steps replans', 'host');
    check(result.operationId === id && result.status === progress.status && result.reason === progress.reason
      && result.sequence === progress.sequence && result.steps === progress.steps && result.replans === progress.replans, 'terminal usage changed');
  }
  const retained = (value: typeof terminal) => ({ ref: navigationReceiptRef(value.receipt), ...value });
  return { schema: 1 as const, operationId: id, disposition, progress,
    admission: retained(admission), progressSource: retained(progressSource), terminal: retained(terminal) };
}
export function readDestinationTerminal(id: string) {
  return readCanonical(pages => loadDestinationTerminal(pages, id));
}
