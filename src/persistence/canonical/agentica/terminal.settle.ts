import type { OperationHostHooks } from '../operationHost';
import type { DestinationProgress } from '../navigation/types';
import type { InteractionProgress } from '../interaction/types';
import { check } from '../validation';
import { assertOperationCustody, captureOperationBinding, loadOperationBinding } from './operation.binding';
import type { OperationBinding } from './operation.types';
import type { PreparedAction } from './types';
import { equal, snapshotPrepared } from './validation';
import { loadOperationConfirmation } from './operation.confirmation';
import { assertEffectiveOperationCustody } from './authority';
import { loadOperationCustodyAck } from './operation.custody';

/** Natural domain settlement only; explicit cancel remains callback-free and independent of evidence reads. */
export function operationSettlementHooks(input: PreparedAction, inputBinding: OperationBinding): OperationHostHooks<DestinationProgress | InteractionProgress> {
  const identity = snapshotPrepared(input), binding = captureOperationBinding(inputBinding);
  return { async prepare(view) {
    const pages = { get: (area: string, key: string) => { check(area === 'execution', 'terminal cannot read hidden world'); return view.getExecution(key); },
      sourceReceipt: view.sourceReceipt, savedSnapshot: view.savedSnapshot, liveOperation: view.liveOperation };
    const bound = await loadOperationBinding(pages, identity, binding);
    check(view.request.operation === 'operation.settle' && equal(view.operation, bound.operation), 'terminal operation changed');
    const confirmed = await loadOperationConfirmation(pages, identity);
    if (bound.kind === 'interaction') check(confirmed && await loadOperationCustodyAck(pages, identity, confirmed.reference, confirmed),
      'interaction settlement requires acknowledged original custody');
    if (confirmed) await assertEffectiveOperationCustody(pages, view.head, identity, confirmed);
    else assertOperationCustody(view.head, bound);
  }, async commit() { return {}; } };
}
