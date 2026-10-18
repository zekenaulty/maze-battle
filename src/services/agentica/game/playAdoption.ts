import type { GameSession } from '../../game/GameSession';
import type { OwnerFence } from '../../../persistence/canonical/types';
import { gameCheckpoint } from '../../../persistence/canonical/game/checkpoint';
import type { RecoveryCandidate } from '../../../persistence/canonical/agentica/recovery.types';
import { inRecoveryDatabase } from '../../../persistence/canonical/agentica/recovery.database';
import { inspectAgenticaRecovery } from '../../../persistence/canonical/agentica/recovery.inspect';
import { prepareAction } from '../../../persistence/canonical/agentica/actions';
import { readLaunch } from '../../../persistence/canonical/agentica/launch';
import { equal, snapshotJson } from '../../../persistence/canonical/agentica/validation';
import { check, fence as validateFence, integer, sameFence } from '../../../persistence/canonical/validation';
import { decisionState, type DecisionView } from './decisionState';
import type { GameLaunchOptions } from './launch';
import type { PlayDecisionOriginal } from './playDecision';
import { retainedDecisionAllowance } from './playAllowance';

export interface PlayAdoptionOffer {
  fence: OwnerFence;
  candidate: RecoveryCandidate;
  launchId: string;
  original: PlayDecisionOriginal;
  objective: string;
  profile: Pick<GameLaunchOptions, 'endpoint' | 'provider' | 'limits'>;
  remainingContinuations: number;
}

/** Only accepts already source-validated canonical readers. This predicate grants no authority. */
export function unclaimedPlayAdoption(view: DecisionView, original: PlayDecisionOriginal) {
  const { terminal, decision, claim, grant, selected } = view.value;
  const { operation, launch, active } = terminal.bound;
  check(equal(terminal.identity.action, original.action) && equal(terminal.binding, original.binding), 'adoption original changed');
  const checkpoint = gameCheckpoint(view.head.checkpoint);
  if (checkpoint.mode === 'town' || checkpoint.mode === 'auto-play') return false;
  if (decision || claim) return false;
  check(!grant, 'adoption successor grant has no intention');
  if (view.head.status !== 'ready' || operation.state !== 'settled' || terminal.event.kind !== 'decision'
    || !terminal.confirmed || launch.guard.state !== 'admitted') return false;
  check(active?.id === launch.binding.launchId && active.sourceAttemptId === launch.guard.admissionAttemptId,
    'adoption root is no longer active');
  check(selected && equal(selected.value.data.grant, original.binding.grant)
    && equal(selected.value.data.publication, original.binding.publication), 'adoption original is not the selected window');
  const source = terminal.bound.grant.value.data, epoch = Number(original.action.sessionEpoch), eventEpoch = Number(terminal.event.sessionEpoch);
  check(integer(epoch, 1) && String(epoch) === original.action.sessionEpoch && epoch === source.epoch
    && integer(eventEpoch, 1) && String(eventEpoch) === terminal.event.sessionEpoch
    && epoch <= eventEpoch && eventEpoch <= view.head.epoch && integer(launch.guard.epoch, epoch) && launch.guard.epoch <= view.head.epoch,
  'adoption original epoch changed');
  // Adoption follows the latest retained event epoch, including a prior operation transfer.
  if (eventEpoch === view.head.epoch
    || launch.guard.owner === view.head.owner && launch.guard.epoch === view.head.epoch) return false;
  return retainedDecisionAllowance(view) > 0;
}

/** Local disclosure only. No publication, schema creation, service contact, lease or adoption. */
export async function inspectPlayAdoption(session: GameSession, inputFence: OwnerFence, input: RecoveryCandidate,
  options: { signal?: AbortSignal } = {}): Promise<PlayAdoptionOffer | null> {
  const fence = snapshotJson(inputFence), candidate = snapshotJson(input), hostSignal = session.hostSignal;
  validateFence(fence);
  const signal = AbortSignal.any([hostSignal, ...(options.signal ? [options.signal] : [])]);
  signal.throwIfAborted(); check(fence.owner === session.owner, 'adoption requires this current owner');
  if (!session.view.controlled || session.view.busy || session.view.recoveryRequired
    || session.view.game?.mode === 'town' || session.view.game?.mode === 'auto-play') return null;
  const current = (readSignal = signal) => {
    signal.throwIfAborted(); readSignal.throwIfAborted();
    const { view } = session, snapshot = view.game?.snapshot;
    check(session.hostSignal === hostSignal && view.controlled && !view.busy && !view.recoveryRequired
      && view.game?.mode !== 'town' && view.game?.mode !== 'auto-play'
      && session.owner === fence.owner && snapshot?.generation === fence.generation && snapshot.gameId === fence.gameId,
    'adoption game control or lifetime changed');
  };
  current();
  return inRecoveryDatabase(signal, async guarded => {
    current(guarded);
    const inspected = await inspectAgenticaRecovery(fence, candidate, { signal: guarded }); current(guarded);
    check(sameFence(fence, inspected.fence) && equal(candidate, inspected.candidate), 'adoption inspection changed');
    if (inspected.operation.state !== 'settled' || inspected.acknowledgement || inspected.terminal?.event.kind !== 'decision'
      || inspected.decision || inspected.claim) return null;
    const original = { action: inspected.action, binding: candidate.binding };
    const identity = await prepareAction(original.action); current(guarded);
    const view = await decisionState(identity, original.binding); current(guarded);
    check(sameFence(fence, view.head), 'adoption decision fence changed');
    if (!unclaimedPlayAdoption(view, original)) return null;
    const launch = await readLaunch(); current(guarded);
    check(sameFence(fence, launch.head) && launch.value && launch.value.binding.launchId === inspected.launchId
      && equal(launch.value, view.value.terminal.bound.launch), 'adoption active root or fence changed');
    const { start, launch: root } = view.value.terminal.bound;
    return structuredClone({ fence, candidate, launchId: root.binding.launchId, original, objective: root.acceptedStart.objective,
      profile: { endpoint: root.binding.endpoint, provider: start.provider, limits: start.limits },
      remainingContinuations: retainedDecisionAllowance(view) });
  });
}
