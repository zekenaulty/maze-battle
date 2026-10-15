import { fields } from '../roster/codec';
import type { CanonicalRequest } from '../types';
import { executeCanonical } from '../transaction';
import { check, request as captureRequest } from '../validation';
import { loadDecisionClaim } from './decision.claim';
import { launchPages, launchWriter } from './launch.records';
import { assertPublicationCurrent } from './publication';
import { readPublicationSelection, retainPublicationSelection } from './publication-selection';
import { loadRunGrant } from './run-grant.read';
import { successorGrantKey } from './run-grant.certificate';
import { transferAdoptionId } from './transfer.adoption';
import type { PreparedAction } from './types';
import { equal, snapshotPrepared, snapshotReference } from './validation';
import type { SuccessorGrant, SuccessorGrantInput } from './run-grant.types';

/** Full transition validation occurs once; the immutable grant is a bounded committed certificate thereafter. */
export function grantDecisionSuccessor(input: CanonicalRequest, action: PreparedAction, options: { signal?: AbortSignal } = {}) {
  const request = captureRequest(input), identity = snapshotPrepared(action);
  const args = fields(request.input, 'action binding claim publication previousSelection') as unknown as SuccessorGrantInput;
  fields(args.binding, 'grant publication');
  for (const ref of [args.claim, args.publication, args.previousSelection, args.binding.grant, args.binding.publication]) snapshotReference(ref);
  check(request.operation === 'agentica.decision.grant' && args.action === identity.storageKey, 'invalid successor grant command');
  return executeCanonical(request, async tx => {
    const pages = launchPages(tx), key = successorGrantKey(identity.storageKey), existing = await pages.get('execution', key);
    if (existing) {
      const retained = await loadRunGrant(pages, { key, id: existing.id });
      check(equal(retained.record.source.input, request.input), 'original successor grant changed');
      return { reference: { ...retained.record.ref } };
    }
    const claim = await loadDecisionClaim(pages, identity); check(claim && equal(claim.reference, args.claim), 'missing exact successor claim');
    const { decision } = claim, { terminal, publication } = decision, { bound } = terminal;
    check(equal(decision.data.binding, args.binding) && equal(decision.data.publication, args.publication)
      && claim.data.state === 'waking' && claim.data.settledUsage === null && !claim.data.stopped,
    'successor claim is not executable');
    assertPublicationCurrent(publication, tx.head);
    const guard = bound.launch.guard;
    check(bound.active?.id === bound.launch.binding.launchId && bound.active.sourceAttemptId === guard.admissionAttemptId
      && guard.state === 'admitted' && guard.owner === tx.head.owner && guard.epoch === tx.head.epoch,
    'successor needs current admitted launch custody');
    const selected = await readPublicationSelection(pages, bound.launch.binding.launchId);
    check(selected && equal(selected.ref, args.previousSelection) && equal(selected.value.data.grant, args.binding.grant),
      'successor predecessor is not selected');
    const guardIntent = decision.data.adoption ? decision.reference : terminal.transfer?.reference ?? null;
    const guardAdoption = decision.data.adoption ? `${decision.reference.id}:guard`
      : terminal.transfer ? transferAdoptionId(terminal.transfer, 'guard') : null;
    if (guardAdoption) {
      const adopted = await pages.sourceReceipt(guardAdoption);
      check(adopted.source.operation === 'operation.adopt' && adopted.source.deadlineAt === null
        && equal(adopted.source.input, { operationId: guard.id }) && equal(adopted.receipt.result, { operationId: guard.id, phase: 'adopt' })
        && adopted.source.expected.owner === tx.head.owner && adopted.source.expected.epoch === tx.head.epoch
        && adopted.receipt.afterRevision === guard.revision
        && (!decision.data.adoption || adopted.receipt.beforeRevision >= claim.row.revision), 'successor guard adoption is not explicit');
    } else check(guard.revision === bound.grant.value.data.guardRevision, 'successor guard changed without adoption');
    const start = { ...bound.start, sessionEpoch: claim.data.started.sessionEpoch,
      observation: decision.data.adoption?.observation ?? decision.data.event.observation };
    const data: SuccessorGrant = { run: claim.reference, publication: args.publication, owner: tx.head.owner, epoch: tx.head.epoch,
      guardRevision: guard.revision, guardAdoption, guardIntent, action: identity.storageKey, binding: args.binding,
      intent: decision.reference, previousSelection: args.previousSelection, original: bound.original.reference,
      result: bound.original.resultReference!, started: claim.data.started, start };
    const writer = launchWriter(tx, request), ref = await writer.put(key, 'agentica-successor-grant', bound.launch.binding.launchId, data);
    await retainPublicationSelection(tx, request, { launchId: bound.launch.binding.launchId, grant: ref,
      publication: args.publication, previousSelection: args.previousSelection }, writer);
    return writer.receipt();
  }, options);
}
