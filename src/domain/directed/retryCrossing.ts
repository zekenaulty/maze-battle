import { isAddress } from '../expedition/explorationGraph';
import type { CellAddress } from '../expedition/types';
import { crossingKey } from './crossingRecovery';
import { rememberDirected } from './knowledge';
import type { DirectedSession, DirectedTransition } from './operationTypes';
import { observeDirected } from './perception';
import { canTraverseDirected, moveDirectedWorld } from './world';

/** Explicit one-step physical retry; never part of automatic route selection. */
export function retryDirectedCrossing(previous: DirectedSession, to: CellAddress): DirectedTransition {
  const from = previous.actor.position;
  if (previous.operation?.status === 'running' || !isAddress(to)
    || !previous.knowledge.blockedEdges?.[crossingKey(from, to)]) {
    return { session: previous, observations: [], events: [], outcome: { status: 'refused',
      reason: 'Retry requires a local remembered blockage and stopped travel.', position: { ...from },
      operation: structuredClone(previous.operation) } };
  }
  const session = structuredClone(previous);
  const passable = canTraverseDirected(session.world, from, to);
  const moved = passable ? moveDirectedWorld(session.world, session.actor, to) : undefined;
  if (moved) { session.world = moved.world; session.actor = moved.actor; }
  const observation = observeDirected(session.world, session.actor, session.knowledge, passable ? 'travel' : 'obstruction');
  observation.scene.traversal = { from: { ...from }, to: { ...to }, passable };
  session.knowledge = rememberDirected(session.knowledge, observation);
  session.revision++;
  return { session, observations: [observation], events: moved ? [moved.event] : [], outcome: {
    status: 'applied', reason: passable ? 'Crossed the passage. Travel remains stopped.' : 'The passage is still obstructed.',
    position: { ...session.actor.position }, operation: structuredClone(session.operation),
  } };
}
