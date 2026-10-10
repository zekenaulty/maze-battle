import { stopDestinationOperation } from '../../../domain/directed/destinationExecution';
import { beginDirectedStreamStep, createDirectedStreamTravel, resolveDirectedStreamStep,
  type DirectedStepPreparation } from '../../../domain/expedition/streaming/directed/execution';
import type { DirectedStreamFrame, DirectedStreamStep, DirectedStreamTravel, ReadDirectedKnowledge,
  StreamDestination } from '../../../domain/expedition/streaming/directed/types';
import { loadDirectedStreamKnowledge } from './knowledge';

export { cancelDirectedStreamTravel, pauseDirectedStreamTravel, settleDirectedStreamMove }
  from '../../../domain/expedition/streaming/directed/execution';
export type { DirectedStreamFrame, DirectedStreamStep, DirectedStreamTravel, ReadDirectedKnowledge, StreamDestination }
  from '../../../domain/expedition/streaming/directed/types';

/** No operation is started implicitly; the caller supplies a concrete remembered target. */
export async function startDirectedStreamTravel(frame: DirectedStreamFrame,
  input: { id: string; target: StreamDestination }, read: ReadDirectedKnowledge, now: () => number = Date.now) {
  const startedAt = now();
  if (!input.id || !Number.isFinite(startedAt) || startedAt < 0) throw new Error('Invalid travel intention.');
  const snapshot = structuredClone(frame);
  const intention = structuredClone(input);
  const loaded = await loadDirectedStreamKnowledge(snapshot, intention.target, read);
  const state = createDirectedStreamTravel(snapshot, { ...intention, now: startedAt, plan: loaded.plan });
  if (state.operation.status === 'running' && now() >= state.operation.deadline) {
    state.operation = stopDestinationOperation(state.operation, 'interrupted', 'Travel time budget exhausted.');
  }
  return { state, diagnostics: loaded.diagnostics };
}

/** Pure proposal: no effects. Atomically persist/CAS this state and exact attempt before host movement. */
export async function prepareDirectedStreamStep(previous: DirectedStreamTravel, frame: DirectedStreamFrame,
  step: DirectedStreamStep, read: ReadDirectedKnowledge, now: () => number = Date.now,
  current: () => boolean = () => true): Promise<DirectedStepPreparation> {
  const begun = beginDirectedStreamStep(previous, frame, step, now());
  if (begun.kind === 'refused') return begun;
  if (begun.kind === 'stopped') return { kind: 'stopped', state: begun.state };
  const state = begun.state;
  const actionId = step.actionId;
  try {
    const loaded = await loadDirectedStreamKnowledge(state.frame, state.operation.target, read, state.blocked,
      () => current() && now() < state.operation.deadline);
    if (!current() || now() >= state.operation.deadline) throw new Error('Travel planning was cancelled or expired.');
    if (loaded.plan.status === 'unavailable' && loaded.plan.reason === 'Known-map budget exceeded.') {
      state.operation = stopDestinationOperation(state.operation, 'interrupted', loaded.plan.reason);
      return { kind: 'stopped', state };
    }
    return resolveDirectedStreamStep(state, loaded.knowledge, loaded.plan, actionId);
  } catch (error) {
    state.operation = stopDestinationOperation(state.operation, 'interrupted',
      error instanceof Error ? error.message : 'Learned route pages are unavailable.');
    return { kind: 'stopped', state };
  }
}
