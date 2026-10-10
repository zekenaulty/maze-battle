import { DIRECTED_LIMITS } from './types';
import { destinationDeadline, exceedsLimit, snapshotDestinationLimits } from './destinationLimits';
import type { DestinationOperation } from './destinationExecution';

/** Shared durable shape checks; policy-unlimited does not make arrays or counters unbounded. */
export function validateDestinationBudget(operation: DestinationOperation<unknown>) {
  const limits = snapshotDestinationLimits(operation.limits);
  for (const count of [operation.steps, operation.replans, operation.nextStep]) {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid destination counter.');
  }
  if (exceedsLimit(operation.steps, limits.steps) || exceedsLimit(operation.replans, limits.replans)
    || !Array.isArray(operation.route) || operation.route.length > DIRECTED_LIMITS.cells
    || exceedsLimit(operation.steps + operation.route.length, limits.steps)
    || operation.deadline !== destinationDeadline(operation.startedAt, limits)) {
    throw new Error('Invalid destination budget snapshot.');
  }
}
