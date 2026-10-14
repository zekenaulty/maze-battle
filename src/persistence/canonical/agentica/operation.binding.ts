import { loadDestination } from '../navigation/records';
import { destinationBinding } from '../navigation/validation';
import { fields } from '../roster/codec';
import type { CanonicalHead } from '../types';
import { check } from '../validation';
import { readAction } from './actions';
import { loadLaunch, loadActiveLaunch } from './launch.read';
import { loadLaunchRecord } from './launch.records';
import type { LaunchGrant } from './launch.types';
import { equal, snapshotPrepared, snapshotReference } from './validation';
import type { ActionResult, PreparedAction } from './types';
import type { OperationBinding, OperationRead } from './operation.types';

export const captureOperationBinding = (b: OperationBinding): OperationBinding => ({ grant: snapshotReference(b.grant), publication: snapshotReference(b.publication) });
export async function loadOperationBinding(pages: OperationRead, input: PreparedAction, inputBinding: OperationBinding) {
  const identity = snapshotPrepared(input), binding = captureOperationBinding(inputBinding);
  const original = await readAction(pages, identity), result = original?.result;
  check(original && result?.operation && result.disposition === 'applied' && !result.completion
    && original.original.effect === 'writesLocalState' && identity.action.capabilityId === 'maze.navigate', 'operation requires original navigation admission');
  const reserved = fields(original.original.sourceRequest.input, 'action grant publication');
  check(original.original.sourceRequest.operation === 'agentica.action.reserve'
    && reserved.action === identity.storageKey && equal(reserved.grant, binding.grant)
    && equal(reserved.publication, binding.publication) && equal(original.original.publication, binding.publication), 'operation original grant changed');
  const grant = await loadLaunchRecord<LaunchGrant>(pages, binding.grant.key, 'agentica-launch-grant', binding.grant); check(grant, 'missing operation grant');
  const launch = await loadLaunch(pages, grant.value.launchId), active = await loadActiveLaunch(pages), run = launch.run!.value.data.started;
  // The grant pins the launch's initial publication; each action reserves its own exact publication above.
  check(launch.grant && equal(launch.grant.ref, binding.grant)
    && identity.action.runId === run.runId && identity.action.sessionId === run.sessionId
    && identity.action.sessionEpoch === run.sessionEpoch && identity.action.manifestHash === run.manifestHash
    && launch.binding.start.capabilities.some(c => c.id === 'maze.navigate' && c.durableHandoff && c.effect === 'writesLocalState'), 'operation launch binding changed');
  const operation = await pages.liveOperation(result.operation.operationId); check(operation, 'missing funded navigation operation');
  const record = await pages.get('execution', original.resultReference!.key), value = record!.value as unknown as ActionResult;
  check(value.proof === 'navigation' && value.sourceAttemptId === operation.admissionAttemptId
    && value.sourceRequest.operation === 'operation.admit', 'operation is not original result admission');
  const args = fields(identity.action.arguments, 'level spaceId row column'), target = destinationBinding(operation.binding).target;
  check(equal({ level: target.level, ...target.cell }, args), 'operation target differs from original action');
  const progress = await loadDestination(pages, operation);
  return { binding, original, result, grant, launch, active, operation, progress };
}
/** Initial publication freshness and action deadline do not govern an already admitted local operation. */
export function assertOperationCustody(head: CanonicalHead, bound: Awaited<ReturnType<typeof loadOperationBinding>>) {
  const { operation, launch, active, grant } = bound, g = grant.value.data;
  check(head.status === 'ready' && head.gameId === operation.gameId && head.generation === operation.generation
    && operation.state === 'admitted' && operation.owner === head.owner && operation.epoch === head.epoch
    && active?.id === launch.binding.launchId && active.sourceAttemptId === launch.guard.admissionAttemptId
    && launch.guard.state === 'admitted' && launch.guard.owner === head.owner && launch.guard.epoch === head.epoch
    && g.owner === head.owner && g.epoch === head.epoch && g.guardRevision === launch.guard.revision,
  'operation custody or launch guard changed');
}
