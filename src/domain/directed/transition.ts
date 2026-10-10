import { isAddress } from '../expedition/explorationGraph';
import { beginDestinationStep, blockDestinationStep, completeDestinationStep, createDestinationOperation, resolveDestinationStep } from './destinationExecution';
import { rememberDirected } from './knowledge';
import { actorNavigationGraph, hasArrived, planKnownDestination, routeHasEdge } from './navigation';
import { observeDirected } from './perception';
import { retryDirectedCrossing } from './retryCrossing';
import type { DirectedCommand, DirectedSession, DirectedTransition, NavigationTarget } from './operationTypes';
import { type ObservationReceipt, type WorldEvent } from './types';
import { canTraverseDirected, interactDirectedWorld, moveDirectedWorld } from './world';

const validId = (value: unknown): value is string => typeof value === 'string' && /^[\w:-]{1,128}$/.test(value);
function validTarget(target: NavigationTarget): boolean {
  return !!target && (target.kind === 'cell' ? target.arrival === 'occupy' && isAddress(target.address)
    : target.kind === 'feature' && target.arrival === 'adjacent' && validId(target.featureId));
}

/** One bounded transaction's decision. This is not the automatic objective-selection policy. */
export function applyDirectedCommand(previous: DirectedSession, command: DirectedCommand, now: number, attemptId?: string): DirectedTransition {
  const session = structuredClone(previous);
  const observations: ObservationReceipt[] = [];
  const events: WorldEvent[] = [];
  const refuse = (reason: string): DirectedTransition => ({ session: previous, observations: [], events: [],
    outcome: { status: 'refused', reason, position: { ...previous.actor.position }, operation: structuredClone(previous.operation) } });
  const observe = (reason: ObservationReceipt['reason'], traversal?: ObservationReceipt['scene']['traversal']) => {
    const observation = observeDirected(session.world, session.actor, session.knowledge, reason);
    if (traversal) observation.scene.traversal = structuredClone(traversal);
    session.knowledge = rememberDirected(session.knowledge, observation);
    observations.push(observation);
  };
  const applied = (reason: string): DirectedTransition => {
    session.revision++;
    return { session, observations, events, outcome: { status: 'applied', reason,
      position: { ...session.actor.position }, operation: structuredClone(session.operation) } };
  };
  if (!Number.isSafeInteger(now) || now < 0 || now > Number.MAX_SAFE_INTEGER - 120_000 || !command) return refuse('Invalid request.');
  if (command.type === 'retry-crossing') return retryDirectedCrossing(previous, command.to);
  if (command.type === 'navigate') {
    if (!validId(command.operationId) || !validTarget(command.target)) return refuse('Invalid destination request.');
    if (session.operation?.status === 'running') return refuse('An intention is already running.');
    observe('look');
    const plan = planKnownDestination(session.knowledge, session.actor.position, command.target);
    session.operation = createDestinationOperation({ id: command.operationId, target: command.target, epoch: session.epoch, now, plan });
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
  if (command.type === 'inspect') {
    if (session.operation?.status === 'running') return refuse('Cancel travel before inspecting.');
    if (!session.actor.perceptionProfile || !validId(attemptId)
      || !['here', 'north', 'east', 'south', 'west'].includes(command.direction)) return refuse('Inspection is unavailable.');
    const observation = observeDirected(session.world, session.actor, session.knowledge, 'inspection', { direction: command.direction, attemptId });
    session.knowledge = rememberDirected(session.knowledge, observation);
    observations.push(observation);
    return applied('Inspection recorded.');
  }
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
  const begin = beginDestinationStep(session.operation, { id: command.operationId, epoch: session.epoch, sequence: command.sequence, now });
  if (begin.kind === 'refused') return refuse(begin.reason);
  session.operation = begin.operation;
  if (begin.kind === 'stopped') return applied(begin.operation.reason);
  const operation = begin.operation;
  observe('travel');
  const graph = actorNavigationGraph(session.knowledge);
  let from = session.actor.position;
  const validRoute = operation.route.length > 0 && operation.route.every(to => {
    const valid = routeHasEdge(graph, from, to); from = to; return valid;
  }) && hasArrived(session.knowledge, from, operation.target);
  const decision = resolveDestinationStep(operation, {
    arrived: hasArrived(session.knowledge, session.actor.position, operation.target), routeValid: validRoute,
    destinationKnown: operation.target.kind === 'cell' || Boolean(session.knowledge.features[operation.target.featureId]),
    plan: () => planKnownDestination(session.knowledge, session.actor.position, operation.target),
  });
  session.operation = decision.operation;
  if (decision.kind === 'stopped') return applied(decision.operation.reason);
  const { next } = decision;
  // Truth is consulted only to apply the immediate collision/move, never to pick a path.
  if (!canTraverseDirected(session.world, session.actor.position, next)) {
    observe('obstruction', { from: session.actor.position, to: next, passable: false });
    session.operation = blockDestinationStep(decision.operation);
    return applied(session.operation.reason);
  }
  const previousPosition = { ...session.actor.position };
  const result = moveDirectedWorld(session.world, session.actor, next);
  session.world = result.world; session.actor = result.actor; events.push(result.event);
  observe('travel', { from: previousPosition, to: next, passable: true });
  session.operation = completeDestinationStep(decision.operation, hasArrived(session.knowledge, session.actor.position, operation.target));
  if (session.operation.status === 'arrived') return applied(session.operation.reason);
  return applied('Travel checkpoint recorded.');
}
