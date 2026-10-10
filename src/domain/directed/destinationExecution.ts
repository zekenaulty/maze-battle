import type { CellAddress } from '../expedition/types';
import type { NavigationPlan } from './navigation';
import { DEFAULT_DESTINATION_LIMITS, destinationDeadline, destinationExpired, exceedsLimit, limitReached,
  snapshotDestinationLimits, type DestinationLimits } from './destinationLimits';

export interface DestinationOperation<T> {
  id: string; target: T; status: 'running' | 'arrived' | 'cancelled' | 'interrupted';
  epoch: number; steps: number; replans: number; nextStep: number;
  route: CellAddress[]; reason: string; startedAt: number; deadline: number | null;
  /** Absent only on legacy records, which retain the original bounded policy. */
  limits?: DestinationLimits;
}

export function stopDestinationOperation<T>(operation: DestinationOperation<T>,
  status: Exclude<DestinationOperation<T>['status'], 'running'>, reason: string): DestinationOperation<T> {
  return { ...structuredClone(operation), status, reason, route: [] };
}
const arrive = <T>(operation: DestinationOperation<T>) => stopDestinationOperation(operation, 'arrived', 'Arrived. No interaction performed.');
const interrupt = <T>(operation: DestinationOperation<T>, reason: string) => stopDestinationOperation(operation, 'interrupted', reason);

export function createDestinationOperation<T>(input: { id: string; target: T; epoch: number; now: number; plan: NavigationPlan;
  limits?: DestinationLimits }): DestinationOperation<T> {
  const { id, target, epoch, now, plan } = input;
  const limits = snapshotDestinationLimits(input.limits);
  const operation: DestinationOperation<T> = { id, target: structuredClone(target), status: 'running', epoch,
    steps: 0, replans: 0, nextStep: 0, route: plan.status === 'ready' ? structuredClone(plan.route) : [],
    reason: 'Travelling to the selected destination.', startedAt: now, deadline: destinationDeadline(now, limits), limits };
  if (plan.status === 'unavailable') return interrupt(operation, plan.reason);
  if (exceedsLimit(plan.distance, limits.steps)) return interrupt(operation, 'Destination exceeds travel step budget.');
  return plan.route.length ? operation : arrive(operation);
}

/** Fences and time bounds precede host observation or any effect. */
export function beginDestinationStep<T>(previous: DestinationOperation<T> | undefined,
  input: { id: string; epoch: number; sequence: number; now: number }):
  { kind: 'refused'; reason: string } | { kind: 'ready' | 'stopped'; operation: DestinationOperation<T> } {
  if (!previous || previous.id !== input.id || previous.status !== 'running'
    || previous.epoch !== input.epoch || previous.nextStep !== input.sequence
    || !Number.isSafeInteger(previous.nextStep + 1)) return { kind: 'refused', reason: 'No matching active step.' };
  const operation = { ...structuredClone(previous), nextStep: previous.nextStep + 1 };
  if (destinationExpired(operation, input.now)) return { kind: 'stopped', operation: interrupt(operation, 'Travel time budget exhausted.') };
  if (limitReached(operation.steps, (operation.limits ?? DEFAULT_DESTINATION_LIMITS).steps)) return {
    kind: 'stopped', operation: interrupt(operation, 'Travel step budget exhausted.'),
  };
  return { kind: 'ready', operation };
}

/** The adapter supplies only actor-known route facts. This layer never chooses objectives. */
export function resolveDestinationStep<T>(previous: DestinationOperation<T>, input: {
  arrived: boolean; routeValid: boolean; destinationKnown: boolean; plan: () => NavigationPlan;
}): { kind: 'stopped'; operation: DestinationOperation<T> } | { kind: 'move'; operation: DestinationOperation<T>; next: CellAddress } {
  let operation = structuredClone(previous);
  const limits = operation.limits ?? DEFAULT_DESTINATION_LIMITS;
  if (!input.destinationKnown) return { kind: 'stopped', operation: interrupt(operation, 'Destination is no longer known at its remembered location.') };
  if (input.arrived) return { kind: 'stopped', operation: arrive(operation) };
  if (!input.routeValid) {
    if (limitReached(operation.replans, limits.replans)) return { kind: 'stopped', operation: interrupt(operation, 'Local replan budget exhausted.') };
    operation.replans++;
    const plan = input.plan();
    if (plan.status !== 'ready') return { kind: 'stopped', operation: interrupt(operation, plan.reason) };
    if (exceedsLimit(plan.distance + operation.steps, limits.steps)) return {
      kind: 'stopped', operation: interrupt(operation, 'Destination exceeds remaining travel step budget.'),
    };
    operation.route = structuredClone(plan.route);
  }
  const next = operation.route[0];
  if (!next) return { kind: 'stopped', operation: interrupt(operation, 'No known route.') };
  return { kind: 'move', operation, next: { ...next } };
}

export function blockDestinationStep<T>(operation: DestinationOperation<T>) {
  if (limitReached(operation.replans, (operation.limits ?? DEFAULT_DESTINATION_LIMITS).replans)) return interrupt(operation, 'Local replan budget exhausted.');
  return { ...structuredClone(operation), route: [], reason: 'The next step is obstructed.' };
}
export function completeDestinationStep<T>(operation: DestinationOperation<T>, arrived: boolean) {
  const next = structuredClone(operation);
  next.steps++;
  next.route.shift();
  return arrived ? arrive(next) : next;
}
