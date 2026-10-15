import type { AgenticaAction } from '../../../services/agentica/contracts';
import { check } from '../validation';
import { assertPublicationCurrent, readPublication } from './publication';
import { equal, snapshotJson, snapshotReference, validateAction } from './validation';
import type { ProtocolRef } from './types';
import { loadActiveLaunch, loadLaunch } from './launch.read';
import { launchPages, loadLaunchRecord } from './launch.records';
import type { LaunchGrant, LaunchGrantContext } from './launch.types';
import { assertPublicationSelected } from './publication-selection';

/** Pair with the effect and pin its deadline on the kernel request. Domain argument/target legality remains caller-owned. */
export async function assertLaunchGrant(tx: LaunchGrantContext, ref: ProtocolRef, action: AgenticaAction, publicationRef: ProtocolRef) {
  const head = snapshotJson(tx.head); ref = snapshotReference(ref); action = validateAction(action); publicationRef = snapshotReference(publicationRef);
  const pages = launchPages(tx), record = await loadLaunchRecord<LaunchGrant>(pages, ref.key, 'agentica-launch-grant', ref); check(record, 'missing launch grant');
  const launch = await loadLaunch(pages, record.value.launchId), active = await loadActiveLaunch(pages), grant = record.value.data;
  check(active?.id === launch.binding.launchId && active.sourceAttemptId === launch.guard.admissionAttemptId
    && launch.grant && equal(launch.grant.ref, ref), 'launch grant is not active');
  check(head.status === 'ready' && launch.guard.state === 'admitted' && launch.guard.owner === head.owner && launch.guard.epoch === head.epoch
    && grant.owner === head.owner && grant.epoch === head.epoch && grant.guardRevision === launch.guard.revision, 'launch grant custody or guard changed');
  const run = launch.run!.value.data.started;
  check(action.runId === run.runId && action.manifestHash === run.manifestHash && action.sessionId === run.sessionId
    && action.sessionEpoch === run.sessionEpoch, 'action is outside launch grant');
  const capability = launch.binding.start.capabilities.find(c => c.id === action.capabilityId); check(capability, 'action capability is not granted');
  await assertPublicationSelected({ head, pages }, launch.binding.launchId, ref, publicationRef);
  const publication = await readPublication(pages, publicationRef); assertPublicationCurrent(publication, head);
  check(publication.epoch === grant.epoch && action.expectedRevision === publication.wireRevision, 'action publication changed');
  check(Date.now() < Date.parse(action.deadlineAt), 'action is outside launch grant');
  return { launchId: launch.binding.launchId, run: structuredClone(run), capability: structuredClone(capability), publication };
}
