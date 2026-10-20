import { fields } from '../roster/codec';
import { check, integer } from '../validation';
import { equal, reference } from './validation';
import { readPublication } from './publication';
import { loadLaunchRecord } from './launch.records';
import { launchBinding, launchGuardId, launchKey, launchSessionId } from './launch.validation';
import { launchStarted } from './launch.wire';
import { validateLaunchAdmission, acceptedLaunchStart } from './launch.service';
import { validateLaunchAckHistory } from './launch.ack-proof';
import { ACTIVE_LAUNCH_KEY, type LaunchDispatch, type LaunchGrant, type LaunchRead, type LaunchRun, type LaunchState } from './launch.types';
import { validateLaunchObjective } from './objective.binding';

export async function loadActiveLaunch(pages: LaunchRead) {
  const pointer = await loadLaunchRecord<{ launchId: string }>(pages, ACTIVE_LAUNCH_KEY, 'agentica-active-launch');
  if (!pointer) return null;
  const data = fields(pointer.value.data, 'launchId'), source = pointer.source;
  launchGuardId(data.launchId as string);
  check(pointer.value.launchId === data.launchId && source.operation === 'operation.admit', 'active launch source changed');
  const binding = launchBinding(fields(source.input, 'operationId binding terminalBytes ackPolicy').binding);
  check(binding.launchId === data.launchId, 'active launch binding changed');
  return { id: data.launchId as string, sourceAttemptId: source.attemptId };
}
export async function loadLaunch(pages: LaunchRead, id: string) {
  const guard = await pages.liveOperation(launchGuardId(id)); check(guard, 'missing launch guard');
  check(guard.ackPolicy === 'verified-host', 'launch requires verified acknowledgement policy');
  const binding = launchBinding(guard.binding);
  check(binding.launchId === id && binding.start.sessionId === launchSessionId(guard.gameId, id), 'launch guard binding changed');
  const admission = await pages.sourceReceipt(guard.admissionAttemptId);
  const state = await loadLaunchRecord<LaunchState>(pages, launchKey(id), 'agentica-launch-state'); check(state, 'missing launch state');
  fields(state.value.data, 'dispatch run grant'); check(state.value.launchId === id, 'launch state identity changed');
  const refs = state.value.data;
  for (const ref of Object.values(refs)) if (ref !== null) reference(ref);
  const dispatch = await loadLaunchRecord<LaunchDispatch>(pages, launchKey(id, 'dispatch'), 'agentica-launch-dispatch', refs.dispatch ?? undefined);
  const run = await loadLaunchRecord<LaunchRun>(pages, launchKey(id, 'run'), 'agentica-launch-run', refs.run ?? undefined);
  const grant = await loadLaunchRecord<LaunchGrant>(pages, launchKey(id, 'grant'), 'agentica-launch-grant', refs.grant ?? undefined);
  check(!!dispatch === !!refs.dispatch && !!run === !!refs.run && !!grant === !!refs.grant && (!run || dispatch) && (!grant || run), 'orphan launch lifecycle record');
  if (dispatch) {
    fields(dispatch.value.data, 'admissionAttemptId'); const input = fields(dispatch.source.input, 'launchId');
    check(dispatch.value.launchId === id && input.launchId === id && dispatch.source.operation === 'agentica.launch.dispatch'
      && dispatch.value.data.admissionAttemptId === guard.admissionAttemptId, 'dispatch source changed');
    check(dispatch.source.expected.owner === admission.source.expected.owner && dispatch.source.expected.epoch === admission.source.expected.epoch
      && dispatch.row.revision > admission.receipt.afterRevision, 'dispatch original custody changed');
  }
  if (run) {
    fields(run.value.data, 'dispatch started admission'); reference(run.value.data.dispatch); launchStarted(run.value.data.started, binding.start);
    const a = validateLaunchAdmission(run.value.data.admission, binding.start, dispatch!.source.attemptId);
    check(a.runId === run.value.data.started.runId && a.manifestHash === run.value.data.started.manifestHash, 'retained run admission changed');
    check(run.value.launchId === id && equal(run.value.data.dispatch, dispatch!.ref) && run.source.operation === 'agentica.launch.announce'
      && equal(run.source.input, { launchId: id, ...run.value.data }) && run.row.revision > dispatch!.row.revision, 'run source changed');
  }
  if (grant) {
    const g = grant.value.data; fields(g, 'run publication owner epoch guardRevision'); reference(g.run); reference(g.publication);
    check(grant.value.launchId === id && equal(g.run, run!.ref) && equal(g.publication, binding.publication)
      && grant.source.operation === 'agentica.launch.grant' && equal(grant.source.input, { launchId: id, run: g.run, publication: g.publication })
      && g.owner === grant.source.expected.owner && g.epoch === grant.source.expected.epoch && String(g.epoch) === binding.start.sessionEpoch
      && integer(g.guardRevision, 1) && g.guardRevision === admission.receipt.afterRevision && grant.row.revision > run!.row.revision, 'grant source changed');
  }
  const last = grant ?? run ?? dispatch;
  check(last ? state.source.attemptId === last.source.attemptId && state.row.revision === last.row.revision
    : state.source.attemptId === guard.admissionAttemptId && state.source.operation === 'operation.admit', 'launch state source changed');
  const publication = await readPublication(pages, binding.publication);
  validateLaunchObjective(publication, id, binding.start.objectiveId);
  check(binding.start.observation.revision === publication.wireRevision && binding.start.sessionEpoch === String(publication.epoch)
    && publication.owner === admission.source.expected.owner && publication.epoch === admission.source.expected.epoch
    && publication.snapshot.revision <= admission.source.expected.revision, 'launch publication binding changed');
  const launch = { binding, guard, state, dispatch, run, grant, publication,
    acceptedStart: run ? acceptedLaunchStart(binding.start, run.value.data.admission) : binding.start };
  await validateLaunchAckHistory(pages, launch); return launch;
}
