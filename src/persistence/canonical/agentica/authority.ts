import type { CanonicalHead } from '../types';
import { check } from '../validation';
import { assertOperationCustody } from './operation.binding';
import type { ConfirmedOperation } from './event.records';
import type { OperationRead } from './operation.types';
import { loadTransfer, loadTransferAuthority, transferStageKey } from './transfer.records';
import type { PreparedAction } from './types';
import { equal } from './validation';

/** Navigation authority only. Original action grants are never renewed or rewritten here. */
export async function assertEffectiveOperationCustody(pages: OperationRead, head: CanonicalHead, identity: PreparedAction, confirmed: ConfirmedOperation) {
  const transfer = await loadTransfer(pages, identity, confirmed);
  if (!transfer) { assertOperationCustody(head, confirmed.bound); return null; }
  const key = transferStageKey(transfer.reference, 'authority'), row = await pages.get('execution', key);
  check(row, 'operation requires explicit transfer adoption');
  const authority = await loadTransferAuthority(pages, identity, confirmed, { key, id: row.id });
  const { operation, launch, active } = confirmed.bound;
  check(equal(authority.transfer.reference, transfer.reference) && head.status === 'ready'
    && head.generation === operation.generation && head.gameId === operation.gameId
    && active?.id === launch.binding.launchId && active.sourceAttemptId === launch.guard.admissionAttemptId
    && operation.state === 'admitted' && launch.guard.state === 'admitted'
    && [operation, launch.guard, transfer.source.expected].every(v => v.owner === head.owner && v.epoch === head.epoch)
    && operation.revision === authority.data.operationRevision && launch.guard.revision === authority.data.guardRevision,
  'operation transfer custody changed');
  return authority;
}
