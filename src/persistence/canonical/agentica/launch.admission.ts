import { operationInput } from '../operationValidation';
import type { CanonicalOperationWork } from '../transaction';
import type { CanonicalRequest } from '../types';
import { check } from '../validation';
import { assertPublicationCurrent, readPublication } from './publication';
import { equal, snapshotJson } from './validation';
import { launchPages, launchWriter } from './launch.records';
import { loadActiveLaunch, loadLaunch } from './launch.read';
import { launchBinding, launchGuardId, launchKey, launchSessionId } from './launch.validation';
import { ACTIVE_LAUNCH_KEY } from './launch.types';

export async function retainLaunchAdmission(tx: CanonicalOperationWork, request: CanonicalRequest) {
  const head = snapshotJson(tx.head), writer = launchWriter(tx, request), input = operationInput(request, 'admit');
  const binding = launchBinding(input.binding), id = binding.launchId, pages = launchPages(tx);
  check(input.ackPolicy === 'verified-host', 'launch requires verified service settlement');
  check(input.operationId === launchGuardId(id) && tx.operation.id === input.operationId
    && tx.operation.admissionAttemptId === request.attemptId && equal(tx.operation.binding, binding), 'launch guard identity changed');
  check(binding.start.sessionId === launchSessionId(head.gameId, id), 'launch session must bind this game and launch');
  const active = await loadActiveLaunch(pages);
  if (active) {
    const previous = await loadLaunch(pages, active.id);
    check(previous.guard.admissionAttemptId === active.sourceAttemptId, 'active launch admission changed');
    check(previous.guard.state === 'acknowledged', 'active launch guard is still funded');
  } else check(await tx.pages.witness('execution', 'agentica/launches/') === null, 'retained launch has no usable active pointer');
  check(!Object.keys(head.allocations).some(key => key.startsWith('agentica-launch:')), 'funded launch guard has no usable active pointer');
  const publication = await readPublication(pages, binding.publication); assertPublicationCurrent(publication, head);
  check(binding.start.sessionEpoch === String(head.epoch) && binding.start.observation.revision === publication.wireRevision, 'launch publication binding changed');
  await writer.put(launchKey(id), 'agentica-launch-state', id, { dispatch: null, run: null, grant: null });
  await writer.put(ACTIVE_LAUNCH_KEY, 'agentica-active-launch', id, { launchId: id }, true);
  return writer.receipt();
}
