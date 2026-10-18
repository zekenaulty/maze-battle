import { inspectAgenticaRecovery, type RecoveryCandidate } from '../../../persistence/canonical/agentica/recovery';
import { readLaunchTerminal } from '../../../persistence/canonical/agentica/launch.terminal';
import { prepareAction } from '../../../persistence/canonical/agentica/actions';
import { equal } from '../../../persistence/canonical/agentica/validation';
import type { OwnerFence } from '../../../persistence/canonical/types';
import { check, sameFence } from '../../../persistence/canonical/validation';
import { decisionState } from './decisionState';
import type { PendingRecoveryRun } from './pendingActionRecovery.types';

/** Called only while the existing schema is held; every input comes from the retained parent. */
export async function pendingRecoveryContext(expected: OwnerFence, candidate: RecoveryCandidate,
  signal: AbortSignal, alive: () => void) {
  alive(); const detail = await inspectAgenticaRecovery(expected, candidate, { signal }); alive();
  check(detail.claim && detail.decision && detail.terminal?.event.kind === 'decision', 'pending recovery requires a retained successor claim');
  const identity = await prepareAction(detail.action); alive();
  const view = await decisionState(identity, candidate.binding); alive();
  check(sameFence(expected, view.head), 'pending recovery inspected fence changed');
  const { claim, grant, terminal } = view.value, { launch, start, active } = terminal.bound;
  check(claim && equal(claim.reference, detail.claim.reference) && equal(claim.data, detail.claim.data)
    && equal(claim.decision.reference, detail.decision.reference), 'pending recovery retained claim changed');
  check(!grant, 'pregrant successor was granted');
  check(active?.id === detail.launchId && launch.binding.launchId === detail.launchId
    && active.sourceAttemptId === launch.guard.admissionAttemptId, 'pending recovery root changed');
  check(launch.guard.terminal?.disposition === 'cancelled', 'stop the root before pending recovery');
  const stop = await readLaunchTerminal(detail.launchId); alive();
  check(sameFence(expected, stop.head) && stop.value.admissionAttemptId === launch.guard.admissionAttemptId
    && stop.value.guardId === launch.guard.id, 'pending recovery cancellation changed');
  const { started } = claim.data;
  check(start.hostId === 'maze-battle' && started.sessionId === start.sessionId
    && started.runId !== launch.run?.value.data.started.runId, 'pending recovery successor identity changed');
  const run: PendingRecoveryRun = { hostId: start.hostId, sessionId: started.sessionId,
    sessionEpoch: started.sessionEpoch, runId: started.runId };
  const anchor = { run, claim: detail.claim, parent: detail.action, start, endpoint: launch.binding.endpoint,
    launchId: detail.launchId, admission: launch.guard.admissionAttemptId, cancellation: stop.value.terminal.source.attemptId };
  return { identity, start, run, endpoint: launch.binding.endpoint, anchor };
}
