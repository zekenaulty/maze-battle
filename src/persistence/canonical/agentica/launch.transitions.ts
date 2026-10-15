import { fields } from '../roster/codec';
import type { CanonicalWork } from '../transaction';
import type { CanonicalRequest } from '../types';
import { check, request as validateRequest } from '../validation';
import { assertPublicationCurrent } from './publication';
import { equal, snapshotJson, snapshotReference } from './validation';
import { loadActiveLaunch, loadLaunch } from './launch.read';
import { launchPages, launchWriter } from './launch.records';
import { launchKey } from './launch.validation';
import { launchStarted } from './launch.wire';
import { validateLaunchAdmission } from './launch.service';
import type { LaunchStarted } from './launch.types';
import { readPublicationSelection, retainPublicationSelection } from './publication-selection';

export async function retainLaunchTransition(tx: CanonicalWork, input: CanonicalRequest) {
  const request = validateRequest(input), head = snapshotJson(tx.head), writer = launchWriter(tx, request), pages = launchPages(tx);
  check(['agentica.launch.dispatch', 'agentica.launch.announce', 'agentica.launch.grant'].includes(request.operation), 'invalid launch transition');
  const action = request.operation.slice('agentica.launch.'.length);
  const args = fields(request.input, action === 'dispatch' ? 'launchId' : action === 'announce' ? 'launchId dispatch started admission' : 'launchId run publication');
  const id = args.launchId as string, current = await loadLaunch(pages, id), state = structuredClone(current.state.value.data);
  const active = await loadActiveLaunch(pages);
  check(active?.id === id && active.sourceAttemptId === current.guard.admissionAttemptId, 'launch is not active');
  if (action === 'dispatch') {
    check(!current.dispatch, 'start already dispatched; reconcile original only');
    check(current.guard.state === 'admitted' && current.guard.owner === head.owner && current.guard.epoch === head.epoch, 'launch guard custody changed');
    assertPublicationCurrent(current.publication, head);
    state.dispatch = await writer.put(launchKey(id, 'dispatch'), 'agentica-launch-dispatch', id, { admissionAttemptId: current.guard.admissionAttemptId });
  } else if (action === 'announce') {
    check(current.guard.state !== 'acknowledged' || current.run, 'settled launch cannot acquire a late run record');
    check(current.dispatch, 'start dispatch was not retained'); const dispatch = snapshotReference(args.dispatch as never);
    const started = launchStarted(args.started as unknown as LaunchStarted, current.binding.start);
    const admission = validateLaunchAdmission(args.admission, current.binding.start, current.dispatch.source.attemptId);
    check(admission.runId === started.runId && admission.manifestHash === started.manifestHash, 'run admission differs from announcement');
    check(equal(dispatch, current.dispatch.ref), 'announcement dispatch changed');
    if (current.run) { check(equal(current.run.value.data, { dispatch, started, admission }), 'original run announcement changed'); return { reference: { ...current.run.ref } }; }
    state.run = await writer.put(launchKey(id, 'run'), 'agentica-launch-run', id, { dispatch, started, admission });
  } else {
    const run = snapshotReference(args.run as never), publication = snapshotReference(args.publication as never);
    check(current.run && equal(run, current.run.ref) && equal(publication, current.binding.publication), 'grant run or publication changed');
    check(current.guard.state === 'admitted' && current.guard.owner === head.owner && current.guard.epoch === head.epoch
      && current.binding.start.sessionEpoch === String(head.epoch), 'launch requires explicit protocol adoption');
    assertPublicationCurrent(current.publication, head);
    if (current.grant) {
      check(await readPublicationSelection(pages, id), 'missing publication selection');
      return { reference: { ...current.grant.ref } };
    }
    state.grant = await writer.put(launchKey(id, 'grant'), 'agentica-launch-grant', id,
      { run, publication, owner: head.owner, epoch: head.epoch, guardRevision: current.guard.revision });
    await retainPublicationSelection({ ...tx, head }, request,
      { launchId: id, grant: state.grant, publication, previousSelection: null }, writer);
  }
  await writer.put(launchKey(id), 'agentica-launch-state', id, state, true); return writer.receipt();
}
