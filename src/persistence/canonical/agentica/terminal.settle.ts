import type { NavigationHostHooks } from '../navigation/host';
import { check } from '../validation';
import { assertOperationCustody, captureOperationBinding, loadOperationBinding } from './operation.binding';
import type { OperationBinding } from './operation.types';
import type { PreparedAction } from './types';
import { equal, snapshotPrepared } from './validation';

/** Natural travel settlement only; explicit cancel remains callback-free and independent of evidence reads. */
export function operationSettlementHooks(input: PreparedAction, inputBinding: OperationBinding): NavigationHostHooks {
  const identity = snapshotPrepared(input), binding = captureOperationBinding(inputBinding);
  return { async prepare(view) {
    const bound = await loadOperationBinding({ get: (area, key) => { check(area === 'execution', 'terminal cannot read hidden world'); return view.getExecution(key); },
      sourceReceipt: view.sourceReceipt, savedSnapshot: view.savedSnapshot, liveOperation: view.liveOperation }, identity, binding);
    check(view.request.operation === 'operation.settle' && equal(view.operation, bound.operation), 'terminal operation changed');
    assertOperationCustody(view.head, bound);
  }, async commit() { return {}; } };
}
