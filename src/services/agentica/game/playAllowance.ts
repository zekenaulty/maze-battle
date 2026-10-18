import type { GameSession } from '../../game/GameSession';
import { prepareAction } from '../../../persistence/canonical/agentica/actions';
import { inRecoveryDatabase } from '../../../persistence/canonical/agentica/recovery.database';
import { operationEntry, validateOperationEntry } from '../../../persistence/canonical/agentica/operation.wire';
import { equal, validateAction } from '../../../persistence/canonical/agentica/validation';
import { check } from '../../../persistence/canonical/validation';
import { captureBinding } from './actionContract';
import { decisionState, type DecisionView } from './decisionState';
import type { PlayDecisionOriginal } from './playDecision';

/** The confirmation reader proves this service usage and effective start; local navigation usage is unrelated. */
export function retainedDecisionAllowance(view: DecisionView) {
  const { terminal } = view.value, { start, result } = terminal.bound;
  check(terminal.confirmed, 'decision requires retained service confirmation');
  const entry = operationEntry(terminal.confirmed.data.entry);
  validateOperationEntry(entry, start, terminal.identity.action, result);
  const { limits } = start, { usage } = entry;
  if (usage.steps >= limits.maxSteps || usage.refinements > limits.maxRefinements) return 0;
  return Math.max(0, limits.maxPlanContinuations - usage.continuations);
}

/** Read-only advisory at one exact same-owner decision. Does not publish, queue work, or refresh the world. */
export async function readPlayDecisionAllowance(session: GameSession, input: PlayDecisionOriginal,
  options: { signal?: AbortSignal } = {}): Promise<number> {
  const original = { action: validateAction(input.action), binding: captureBinding(input.binding) };
  const hostSignal = session.hostSignal, owner = session.owner, snapshot = session.view.game?.snapshot;
  const expected = snapshot && { generation: snapshot.generation, gameId: snapshot.gameId, revision: snapshot.revision };
  const signal = AbortSignal.any([hostSignal, ...(options.signal ? [options.signal] : [])]);
  const current = (readSignal = signal) => {
    signal.throwIfAborted(); readSignal.throwIfAborted();
    const { view } = session, now = view.game?.snapshot;
    check(session.hostSignal === hostSignal && session.owner === owner && view.controlled && !view.busy && !view.recoveryRequired
      && expected && now?.generation === expected.generation && now.gameId === expected.gameId && now.revision === expected.revision,
    'decision allowance control or lifetime changed');
  };
  current();
  return inRecoveryDatabase(signal, async guarded => {
    current(guarded);
    const identity = await prepareAction(original.action); current(guarded);
    const view = await decisionState(identity, original.binding); current(guarded);
    const { head, value: { terminal, decision, claim, grant, selected } } = view;
    const { launch, active, operation } = terminal.bound;
    check(head.generation === expected!.generation && head.gameId === expected!.gameId && head.revision === expected!.revision
      && head.owner === owner && head.status === 'ready', 'decision allowance fence changed');
    check(equal(terminal.identity.action, original.action) && equal(terminal.binding, original.binding)
      && !decision && !claim && !grant && operation.state === 'settled' && terminal.event.kind === 'decision',
    'decision allowance requires the unclaimed original decision');
    check(original.action.sessionEpoch === String(head.epoch) && terminal.event.sessionEpoch === String(head.epoch)
      && terminal.bound.grant.value.data.owner === owner && terminal.bound.grant.value.data.epoch === head.epoch
      && launch.guard.owner === owner && launch.guard.epoch === head.epoch, 'decision allowance requires the same owner and epoch');
    check(launch.guard.state === 'admitted' && active?.id === launch.binding.launchId
      && active.sourceAttemptId === launch.guard.admissionAttemptId, 'decision allowance root is no longer active');
    check(selected && equal(selected.value.data.grant, original.binding.grant)
      && equal(selected.value.data.publication, original.binding.publication), 'decision allowance original is not selected');
    return retainedDecisionAllowance(view);
  });
}
