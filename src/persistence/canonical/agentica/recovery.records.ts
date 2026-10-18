import { fields } from '../roster/codec';
import { check } from '../validation';
import { loadActiveLaunch, loadLaunch } from './launch.read';
import { captureOperationBinding } from './operation.binding';
import type { OperationRead } from './operation.types';
import { readPublicationSelection } from './publication-selection.records';
import { loadRunGrant } from './run-grant.read';
import type { SuccessorGrant } from './run-grant.types';
import type { PendingAction, ProtocolRef } from './types';
import type { RecoveryCandidate, RecoveryInventory } from './recovery.types';
import { readSource } from './validation.source';
import { equal, restoreRetainedAction, snapshotReference } from './validation';
import type { CanonicalQuery } from '../read';
import { readClaimedParent } from './recovery.claimed';

export const recoveryOperationId = (key: string) => {
  check(/^agentica\/actions\/[a-f0-9]{64}$/.test(key), 'invalid recovery action key');
  return `travel-${key.slice(-64)}`;
};

/** Always reconstruct from the immutable reserve, never from the current selected pair. */
export async function recoveryOriginal(pages: OperationRead, input: ProtocolRef) {
  const ref = snapshotReference(input);
  const pending = await readSource(pages, ref, 'agentica-action', 'key fingerprint action publication effect') as PendingAction;
  const args = fields(pending.sourceRequest.input, 'action grant publication');
  const binding = captureOperationBinding({ grant: args.grant as unknown as ProtocolRef, publication: args.publication as unknown as ProtocolRef });
  const identity = await restoreRetainedAction(pages, ref, binding);
  check(['maze.navigate', 'maze.explore'].includes(identity.action.capabilityId) && pending.effect === 'writesLocalState', 'recovery requires original navigation');
  return { identity, candidate: { operationId: recoveryOperationId(ref.key), original: ref, binding } satisfies RecoveryCandidate };
}

export async function recoveryPointers(pages: CanonicalQuery) {
  const active = await loadActiveLaunch(pages);
  if (!active) {
    check(await pages.witness('execution', 'agentica/launches/') === null, 'missing active funded or retained launch');
    return { active: null, selected: null, claimed: null };
  }
  const launch = await loadLaunch(pages, active.id);
  check(launch.guard.admissionAttemptId === active.sourceAttemptId, 'active launch admission changed');
  const selected = await readPublicationSelection(pages, active.id);
  check(!!selected === !!launch.grant, 'missing or orphan recovery publication selection');
  let selection: RecoveryInventory['selected'] = null;
  if (selected) {
    const grant = await loadRunGrant(pages, selected.value.data.grant);
    check(grant.launch.binding.launchId === active.id, 'selected recovery launch changed');
    let predecessor: RecoveryCandidate | null = null;
    if (grant.record.value.kind === 'agentica-successor-grant') {
      const data = grant.record.value.data as SuccessorGrant;
      predecessor = (await recoveryOriginal(pages, data.original)).candidate;
      check(equal(predecessor.binding, data.binding), 'selected predecessor binding changed');
    }
    selection = { reference: selected.ref, binding: captureOperationBinding(selected.value.data), predecessor };
  }
  return { active: { launchId: active.id, guardId: launch.guard.id, state: launch.guard.state, grant: launch.grant?.ref ?? null },
    selected: selection, claimed: await readClaimedParent(pages, active) };
}
