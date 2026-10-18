import { operationReceiptRef } from '../operationHost';
import { readCanonical, type CanonicalQuery } from '../read';
import { fields } from '../roster/codec';
import { check } from '../validation';
import { same } from '../world/records';
import { interactionKey, loadInteraction } from './records';
import { interactionDisposition } from './types';

/** Cancellation retains any committed effect. It never rewrites applied progress as unperformed. */
export async function loadInteractionTerminal(pages: Pick<CanonicalQuery, 'get' | 'sourceReceipt' | 'liveOperation'>, id: string) {
  interactionKey(id);
  const operation = await pages.liveOperation(id); check(operation?.terminal, 'interaction has no terminal receipt');
  const progress = await loadInteraction(pages, operation), disposition = operation.terminal.disposition;
  check(disposition === 'cancelled' || disposition === interactionDisposition(progress), 'interaction terminal disagrees with progress');
  const admission = await pages.sourceReceipt(operation.admissionAttemptId);
  const progressSource = await pages.sourceReceipt(progress.sourceAttemptId);
  const terminal = await pages.sourceReceipt(operation.terminal.attemptId);
  check(progressSource.receipt.afterRevision <= terminal.receipt.beforeRevision, 'interaction progress is newer than terminal');
  if (disposition === 'cancelled') check(terminal.source.operation === 'operation.cancel'
    && same(terminal.receipt.result, { operationId: id, phase: 'cancel' }), 'invalid interaction cancellation');
  else {
    const result = fields(terminal.receipt.result, 'operationId status reason sequence outcome', 'host');
    check(terminal.source.operation === 'operation.settle' && result.operationId === id && result.status === progress.status
      && result.reason === progress.reason && result.sequence === progress.sequence && same(result.outcome, progress.result),
    'interaction terminal outcome changed');
  }
  const retained = (value: typeof terminal) => ({ ref: operationReceiptRef(value.receipt), ...value });
  return { schema: 1 as const, operationId: id, disposition, progress,
    admission: retained(admission), progressSource: retained(progressSource), terminal: retained(terminal) };
}
export function readInteractionTerminal(id: string) { return readCanonical(pages => loadInteractionTerminal(pages, id)); }
