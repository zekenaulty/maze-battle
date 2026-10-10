import type { CellAddress } from '../expedition/types';
import type { NavigationPlan } from './navigation';
import { DIRECTED_LIMITS } from './types';

export interface DestinationOperation<T> {
  id: string; target: T; status: 'running' | 'arrived' | 'cancelled' | 'interrupted';
  epoch: number; steps: number; replans: number; nextStep: number;
  route: CellAddress[]; reason: string; startedAt: number; deadline: number;
}

export function stopDestinationOperation<T>(operation: DestinationOperation<T>,
  status: Exclude<DestinationOperation<T>['status'], 'running'>, reason: string): DestinationOperation<T> {
  return { ...structuredClone(operation), status, reason, route: [] };
}
const arrive = <T>(operation: DestinationOperation<T>) => stopDestinationOperation(operation, 'arrived', 'Arrived. No interaction performed.');
const interrupt = <T>(operation: DestinationOperation<T>, reason: string) => stopDestinationOperation(operation, 'interrupted', reason);

export function createDestinationOperation<T>(input: { id: string; target: T; epoch: number; now: number; plan: NavigationPlan }): DestinationOperation<T> {
  const { id, target, epoch, now, plan } = input;
  const operation: DestinationOperation<T> = { id, target: structuredClone(target), status: 'running', epoch,
    steps: 0, replans: 0, nextStep: 0, route: plan.status === 'ready' ? structuredClone(plan.route) : [],
    reason: 'Travelling to the selected destination.', startedAt: now, deadline: now + 120_000 };
  if (plan.status === 'unavailable') return interrupt(operation, plan.reason);
  if (plan.distance > DIRECTED_LIMITS.steps) return interrupt(operation, 'Destination exceeds travel step budget.');
  return plan.route.length ? operation : arrive(operation);
}

/** Fences and time bounds precede host observation or any effect. */
export function beginDestinationStep<T>(previous: DestinationOperation<T> | undefined,
  input: { id: string; epoch: number; sequence: number; now: number }):
  { kind: 'refused'; reason: string } | { kind: 'ready' | 'stopped'; operation: DestinationOperation<T> } {
  if (!previous || previous.id !== input.id || previous.status !== 'running'
    || previous.epoch !== input.epoch || previous.nextStep !== input.sequence) return { kind: 'refused', reason: 'No matching active step.' };
  const operation = { ...structuredClone(previous), nextStep: previous.nextStep + 1 };
  if (input.now >= operation.deadline) return { kind: 'stopped', operation: interrupt(operation, 'Travel time budget exhausted.') };
  if (operation.steps >= DIRECTED_LIMITS.steps) return { kind: 'stopped', operation: interrupt(operation, 'Travel step budget exhausted.') };
  return { kind: 'ready', operation };
}

/** The adapter supplies only actor-known route facts. This layer never chooses objectives. */
export function resolveDestinationStep<T>(previous: DestinationOperation<T>, input: {
  arrived: boolean; routeValid: boolean; destinationKnown: boolean; plan: () => NavigationPlan;
}): { kind: 'stopped'; operation: DestinationOperation<T> } | { kind: 'move'; operation: DestinationOperation<T>; next: CellAddress } {
  let operation = structuredClone(previous);
  if (!input.destinationKnown) return { kind: 'stopped', operation: interrupt(operation, 'Destination is no longer known at its remembered location.') };
  if (input.arrived) return { kind: 'stopped', operation: arrive(operation) };
  if (!input.routeValid) {
    if (operation.replans >= DIRECTED_LIMITS.replans) return { kind: 'stopped', operation: interrupt(operation, 'Local replan budget exhausted.') };
    operation.replans++;
    const plan = input.plan();
    if (plan.status !== 'ready') return { kind: 'stopped', operation: interrupt(operation, plan.reason) };
    if (plan.distance > DIRECTED_LIMITS.steps - operation.steps) return {
      kind: 'stopped', operation: interrupt(operation, 'Destination exceeds remaining travel step budget.'),
    };
    operation.route = structuredClone(plan.route);
  }
  const next = operation.route[0];
  if (!next) return { kind: 'stopped', operation: interrupt(operation, 'No known route.') };
  return { kind: 'move', operation, next: { ...next } };
}

export function blockDestinationStep<T>(operation: DestinationOperation<T>) {
  if (operation.replans >= DIRECTED_LIMITS.replans) return interrupt(operation, 'Local replan budget exhausted.');
  return { ...structuredClone(operation), route: [], reason: 'The next step is obstructed.' };
}
export function completeDestinationStep<T>(operation: DestinationOperation<T>, arrived: boolean) {
  const next = { ...structuredClone(operation), steps: operation.steps + 1, route: operation.route.slice(1) };
  return arrived ? arrive(next) : next;
}
