import { isAddress } from '../expedition/explorationGraph';
import type { CellAddress } from '../expedition/types';
import { rememberDirected } from './knowledge';
import { actorNavigationGraph, hasArrived, planKnownDestination, routeHasEdge } from './navigation';
import { observeDirected } from './perception';
import type { DirectedCommand, DirectedSession, DirectedTransition, NavigationTarget } from './operationTypes';
import { DIRECTED_LIMITS, type ObservationReceipt, type WorldEvent } from './types';
import { canTraverseDirected, interactDirectedWorld, moveDirectedWorld } from './world';

const validId = (value: unknown): value is string => typeof value === 'string' && /^[\w:-]{1,128}$/.test(value);
function validTarget(target: NavigationTarget): boolean {
  return !!target && (target.kind === 'cell' ? target.arrival === 'occupy' && isAddress(target.address)
    : target.kind === 'feature' && target.arrival === 'adjacent' && validId(target.featureId));
}

/** One bounded transaction's decision. This is not the automatic objective-selection policy. */
export function applyDirectedCommand(previous: DirectedSession, command: DirectedCommand, now: number): DirectedTransition {
  const session = structuredClone(previous);
  const observations: ObservationReceipt[] = [];
  const events: WorldEvent[] = [];
  const refuse = (reason: string): DirectedTransition => ({ session: previous, observations: [], events: [],
    outcome: { status: 'refused', reason, position: { ...previous.actor.position }, operation: structuredClone(previous.operation) } });
  const observe = (reason: ObservationReceipt['reason']) => {
    const observation = observeDirected(session.world, session.actor, session.knowledge, reason);
    session.knowledge = rememberDirected(session.knowledge, observation);
    observations.push(observation);
  };
  const applied = (reason: string): DirectedTransition => {
    session.revision++;
    return { session, observations, events, outcome: { status: 'applied', reason,
      position: { ...session.actor.position }, operation: structuredClone(session.operation) } };
  };
  if (!Number.isSafeInteger(now) || now < 0 || !command) return refuse('Invalid request.');
  if (command.type === 'navigate') {
    if (!validId(command.operationId) || !validTarget(command.target)) return refuse('Invalid destination request.');
    if (session.operation?.status === 'running') return refuse('An intention is already running.');
    observe('look');
    const plan = planKnownDestination(session.knowledge, session.actor.position, command.target);
    const arrived = plan.status === 'ready' && plan.route.length === 0;
    const tooFar = plan.status === 'ready' && plan.distance > DIRECTED_LIMITS.steps;
    session.operation = { id: command.operationId, target: structuredClone(command.target),
      status: plan.status === 'unavailable' || tooFar ? 'interrupted' : arrived ? 'arrived' : 'running',
      epoch: session.epoch, steps: 0, replans: 0, nextStep: 0, route: plan.status === 'ready' && !tooFar ? plan.route : [],
      reason: tooFar ? 'Destination exceeds travel step budget.' : plan.status === 'unavailable' ? plan.reason : arrived ? 'Arrived. No interaction performed.' : 'Travelling to the selected destination.',
      startedAt: now, deadline: now + 120_000 };
    return applied(session.operation.reason);
  }
  if (command.type === 'cancel') {
    if (session.operation?.id !== command.operationId || session.operation.status !== 'running') return refuse('No matching active intention.');
    session.operation.status = 'cancelled';
    session.operation.reason = 'Cancelled by the controller.';
    session.operation.route = [];
    return applied(session.operation.reason);
  }
  if (command.type === 'look') { observe('look'); return applied('Observation recorded.'); }
  if (command.type === 'interact') {
    if (session.operation?.status === 'running') return refuse('Cancel travel before interacting.');
    // The supplied ID must already be actor-known before the host checks mechanics.
    if (!validId(command.featureId) || !session.knowledge.features[command.featureId]) return refuse('No known interaction here.');
    try {
      const result = interactDirectedWorld(session.world, session.actor, command.featureId);
      session.world = result.world; events.push(result.event);
    } catch { return refuse('No available interaction here.'); }
    observe('interaction');
    return applied('Interaction performed.');
  }
  if (command.type !== 'step') return refuse('Unsupported request.');
  const operation = session.operation;
  if (!operation || operation.id !== command.operationId || operation.status !== 'running'
    || operation.epoch !== session.epoch || command.sequence !== operation.nextStep) return refuse('No matching active step.');
  operation.nextStep++;
  const interrupt = (reason: string) => {
    operation.status = 'interrupted'; operation.reason = reason; operation.route = [];
    return applied(reason);
  };
  if (now >= operation.deadline) return interrupt('Travel time budget exhausted.');
  if (operation.steps >= DIRECTED_LIMITS.steps) return interrupt('Travel step budget exhausted.');
  observe('travel');
  if (operation.target.kind === 'feature' && !session.knowledge.features[operation.target.featureId]) {
    return interrupt('Destination is no longer known at its remembered location.');
  }
  const arrive = () => {
    operation.status = 'arrived'; operation.reason = 'Arrived. No interaction performed.'; operation.route = [];
    return applied(operation.reason);
  };
  if (hasArrived(session.knowledge, session.actor.position, operation.target)) return arrive();
  const graph = actorNavigationGraph(session.knowledge);
  let from = session.actor.position;
  const validRoute = operation.route.length > 0 && operation.route.every(to => {
    const valid = routeHasEdge(graph, from, to); from = to; return valid;
  }) && hasArrived(session.knowledge, from, operation.target);
  if (!validRoute) {
    if (operation.replans >= DIRECTED_LIMITS.replans) return interrupt('Local replan budget exhausted.');
    operation.replans++;
    const plan = planKnownDestination(session.knowledge, session.actor.position, operation.target);
    if (plan.status !== 'ready') return interrupt(plan.reason);
    if (plan.distance > DIRECTED_LIMITS.steps - operation.steps) return interrupt('Destination exceeds remaining travel step budget.');
    operation.route = plan.route;
  }
  const next: CellAddress | undefined = operation.route[0];
  if (!next) return interrupt('No known route.');
  // Truth is consulted only to apply the immediate collision/move, never to pick a path.
  if (!canTraverseDirected(session.world, session.actor.position, next)) {
    observe('obstruction'); operation.route = []; operation.reason = 'The next step is obstructed.';
    if (operation.replans >= DIRECTED_LIMITS.replans) return interrupt('Local replan budget exhausted.');
    return applied(operation.reason);
  }
  const result = moveDirectedWorld(session.world, session.actor, next);
  session.world = result.world; session.actor = result.actor; events.push(result.event);
  operation.route.shift(); operation.steps++;
  observe('travel');
  if (hasArrived(session.knowledge, session.actor.position, operation.target)) return arrive();
  return applied('Travel checkpoint recorded.');
}
