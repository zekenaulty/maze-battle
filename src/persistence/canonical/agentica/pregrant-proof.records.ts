import { check } from '../validation';
import { loadOriginalAction } from './actions.original';
import { loadDecisionClaim } from './decision.claim';
import { loadLaunchTerminal } from './launch.terminal';
import { assertBoundAction, captureOperationBinding } from './operation.binding';
import type { OperationBinding, OperationRead } from './operation.types';
import { readPublicationSelection } from './publication-selection.records';
import { successorGrantKey } from './run-grant.certificate';
import { loadRunGrant } from './run-grant.read';
import { loadAgenticaTerminal } from './terminal';
import type { PreparedAction } from './types';
import { equal, snapshotPrepared } from './validation';

/** Absence is usable only after an irreversible Stop closes the sole grant writer. */
export async function loadPregrantStop(pages: OperationRead, inputParent: PreparedAction,
  inputBinding: OperationBinding, inputPending: PreparedAction) {
  const parent = snapshotPrepared(inputParent), binding = captureOperationBinding(inputBinding), pending = snapshotPrepared(inputPending);
  const claim = await loadDecisionClaim(pages, parent); check(claim, 'pregrant proof requires original correlated claim');
  const { decision, data: { started } } = claim, { bound } = decision.terminal;
  assertBoundAction(bound, parent, binding);
  check(equal(decision.data.binding, binding), 'pregrant original decision binding changed');
  if (bound.operation.state === 'acknowledged') await loadAgenticaTerminal(pages, parent, binding);
  const action = pending.action, observation = decision.data.adoption?.observation ?? decision.data.event.observation;
  check(action.runId === started.runId && action.sessionId === started.sessionId && action.sessionEpoch === started.sessionEpoch
    && action.runId !== bound.launch.run?.value.data.started.runId
    && action.manifestHash === started.manifestHash && action.expectedRevision === observation.revision
    && observation.revision === decision.publication.wireRevision && action.sessionEpoch === String(decision.publication.epoch)
    && bound.start.capabilities.some(capability => capability.id === action.capabilityId), 'pregrant pending action binding changed');
  const stop = await loadLaunchTerminal(pages, bound.launch.binding.launchId);
  check(stop.guardId === bound.launch.guard.id && stop.admissionAttemptId === bound.launch.guard.admissionAttemptId,
    'pregrant cancellation belongs to another launch');
  check(decision.row.revision <= stop.terminal.receipt.beforeRevision, 'pregrant intention is newer than cancellation');
  const key = successorGrantKey(parent.storageKey);
  check(!await pages.get('execution', key), 'pregrant successor was granted');
  const selected = await readPublicationSelection(pages, bound.launch.binding.launchId);
  check(selected, 'pregrant publication selection is missing');
  check(selected.row.revision <= stop.terminal.receipt.beforeRevision, 'pregrant selection is newer than cancellation');
  // Dereference even when the grant key is absent: a dangling selection is corruption, not non-execution.
  const selectedGrant = await loadRunGrant(pages, selected.value.data.grant);
  check(selectedGrant.launch.binding.launchId === bound.launch.binding.launchId
    && selectedGrant.started.runId !== started.runId, 'pregrant successor was selected');
  check(!await loadOriginalAction(pages, pending), 'pregrant action already has canonical custody');
  check(!await pages.liveOperation(`travel-${pending.storageKey.slice(-64)}`), 'pregrant action already has an operation');
  return { cancellation: stop.terminal, claim: claim.reference };
}
