import { beginDestinationStep, blockDestinationStep, completeDestinationStep, createDestinationOperation,
  resolveDestinationStep, stopDestinationOperation } from '../../../directed/destinationExecution';
import type { NavigationPlan } from '../../../directed/navigation';
import { sameAddress } from '../../address';
import { copyAddress, isAddress } from '../../explorationGraph';
import { validateInput } from '../plannerPage';
import type { StreamActionResult, StreamCheckpoint } from '../types';
import type { DirectedStreamKnowledge } from './knowledge';
import type { DirectedStreamFrame, DirectedStreamStep, DirectedStreamTravel, StreamDestination } from './types';
import type { DestinationLimits } from '../../../directed/destinationLimits';

export function sameDirectedFrame(a: DirectedStreamFrame, b: DirectedStreamFrame): boolean {
  return a.control.sessionId === b.control.sessionId && a.control.epoch === b.control.epoch
    && a.checkpoint.worldId === b.checkpoint.worldId && a.checkpoint.floorId === b.checkpoint.floorId
    && a.checkpoint.scopeId === b.checkpoint.scopeId && a.checkpoint.revision === b.checkpoint.revision
    && a.checkpoint.topologyRevision === b.checkpoint.topologyRevision && a.checkpoint.phase === b.checkpoint.phase
    && sameAddress(a.checkpoint.position, b.checkpoint.position);
}

export function createDirectedStreamTravel(frame: DirectedStreamFrame,
  input: { id: string; target: StreamDestination; now: number; plan: NavigationPlan; limits?: DestinationLimits }): DirectedStreamTravel {
  validateInput(frame.checkpoint, frame.control);
  const operation = createDestinationOperation({ ...input, epoch: frame.control.epoch });
  return { operation: frame.checkpoint.phase === 'complete'
    ? stopDestinationOperation(operation, 'interrupted', 'Expedition is complete.') : operation,
  frame: structuredClone(frame), blocked: [], paused: false };
}

export type DirectedStepPreparation = { kind: 'refused'; reason: string }
  | { kind: 'stopped'; state: DirectedStreamTravel }
  | { kind: 'move'; state: DirectedStreamTravel };

/** Call before reading learned pages. The parent must CAS the returned state before dispatch. */
export function beginDirectedStreamStep(previous: DirectedStreamTravel, frame: DirectedStreamFrame,
  step: DirectedStreamStep, now: number): { kind: 'refused'; reason: string }
  | { kind: 'ready' | 'stopped'; state: DirectedStreamTravel } {
  validateInput(frame.checkpoint, frame.control);
  if (previous.paused || previous.pending || !sameDirectedFrame(previous.frame, frame)
    || !step.actionId || !Number.isFinite(now)) return { kind: 'refused', reason: 'Travel is paused, pending, or its custody has changed.' };
  const begun = beginDestinationStep(previous.operation,
    { id: step.operationId, epoch: frame.control.epoch, sequence: step.sequence, now });
  if (begun.kind === 'refused') return begun;
  return { kind: begun.kind, state: { ...structuredClone(previous), operation: begun.operation } };
}

export function resolveDirectedStreamStep(state: DirectedStreamTravel, knowledge: DirectedStreamKnowledge,
  plan: NavigationPlan, actionId: string): DirectedStepPreparation {
  const { checkpoint, control } = state.frame;
  const operation = state.operation;
  const resolved = resolveDestinationStep(operation, {
    arrived: knowledge.arrived(checkpoint.position, operation.target), destinationKnown: knowledge.knows(operation.target),
    routeValid: knowledge.routeValid(checkpoint.position, operation.route, operation.target), plan: () => plan,
  });
  const next = { ...structuredClone(state), operation: resolved.operation };
  if (resolved.kind === 'stopped') return { kind: 'stopped', state: next };
  const direction = knowledge.direction(checkpoint.position, resolved.next);
  if (!direction) throw new Error('Next step has no actor-known edge.');
  next.pending = { from: copyAddress(checkpoint.position), to: copyAddress(resolved.next),
    kind: checkpoint.position.spaceId === resolved.next.spaceId ? 'local' : 'crossing',
    request: { version: 2, actionId, sessionId: control.sessionId, epoch: control.epoch,
      expectedRevision: checkpoint.revision, expectedTopologyRevision: checkpoint.topologyRevision,
      command: { type: 'move', direction } } };
  return { kind: 'move', state: next };
}

export function cancelDirectedStreamTravel(state: DirectedStreamTravel): DirectedStreamTravel {
  if (state.operation.status !== 'running') return structuredClone(state);
  return { ...structuredClone(state), operation: stopDestinationOperation(state.operation, 'cancelled', 'Travel cancelled.') };
}

/** A restored intention never restarts itself. Preserve an unknown attempt for exact reconciliation. */
export function pauseDirectedStreamTravel(state: DirectedStreamTravel, reason = 'Paused after reload. Select a destination to travel again.'): DirectedStreamTravel {
  const next = structuredClone(state);
  next.paused = true;
  next.operation.route = [];
  if (next.operation.status === 'running') next.operation.reason = reason;
  return next;
}

/** Host collision is evidence about this immediate edge only, never a remote route query. */
export function settleDirectedStreamMove(previous: DirectedStreamTravel, result: StreamActionResult,
  immediateCollision = false, confirmedCheckpoint?: StreamCheckpoint): DirectedStreamTravel {
  const pending = previous.pending;
  if (!pending || pending.request.actionId !== result.actionId) throw new Error('No matching pending travel attempt.');
  if (result.disposition === 'unavailable') return pauseDirectedStreamTravel(previous, 'Move acknowledgement is unknown; reconcile the original attempt.');
  if (result.disposition === 'conflict') {
    const paused = pauseDirectedStreamTravel(previous, 'Travel custody or revision changed.');
    delete paused.pending;
    return paused;
  }
  // Durable v2 receipts are compact. A checkpoint read in the effect transaction
  // supplies position/revision evidence without manufacturing an observation.
  const observation = confirmedCheckpoint ?? result.observation;
  const checkpoint = previous.frame.checkpoint;
  const moved = result.disposition === 'applied';
  const revision = pending.request.expectedRevision + (moved ? 1 : 0);
  if (!observation || observation.version !== 2 || !isAddress(observation.position)
    || result.beforeRevision !== pending.request.expectedRevision || result.afterRevision !== revision
    || result.topologyRevision !== pending.request.expectedTopologyRevision || observation.revision !== revision
    || observation.topologyRevision !== result.topologyRevision || observation.worldId !== checkpoint.worldId
    || observation.floorId !== checkpoint.floorId || observation.scopeId !== checkpoint.scopeId
    || observation.phase !== checkpoint.phase || !sameAddress(observation.position, moved ? pending.to : pending.from)
    || (immediateCollision && moved)) {
    return pauseDirectedStreamTravel(previous, 'Move result does not match the prepared edge; reconcile the original attempt.');
  }
  const next = structuredClone(previous);
  delete next.pending;
  next.frame.checkpoint.revision = revision;
  next.frame.checkpoint.position = copyAddress(observation.position);
  if (moved) {
    next.frame.checkpoint.moves++;
    const target = next.operation.target;
    const arrived = sameAddress(pending.to, target.kind === 'doorway' && target.arrival === 'cross' ? target.destination : target.address);
    const completed = completeDestinationStep(next.operation, arrived);
    next.operation = previous.operation.status === 'running' && !previous.paused ? completed
      : { ...completed, status: previous.operation.status, reason: previous.operation.reason, route: [] };
  } else if (immediateCollision) {
    if (!next.blocked.some(block => sameAddress(block.from, pending.from) && sameAddress(block.to, pending.to))) {
      next.blocked.push({ from: copyAddress(pending.from), to: copyAddress(pending.to), revision });
    }
    if (next.operation.status === 'running' && !next.paused) next.operation = blockDestinationStep(next.operation);
  } else if (next.operation.status === 'running') {
    next.operation = stopDestinationOperation(next.operation, 'interrupted', 'Host refused the prepared move.');
  }
  return next;
}
