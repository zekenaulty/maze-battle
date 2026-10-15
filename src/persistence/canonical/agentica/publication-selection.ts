import { fields } from '../roster/codec';
import { canonicalFence, executeCanonical, type CanonicalWork } from '../transaction';
import type { CanonicalHead, CanonicalRequest } from '../types';
import { check, request as validateRequest, sameFence } from '../validation';
import { assertPublicationCurrent, readPublication } from './publication';
import { equal, reference, snapshotJson, snapshotReference } from './validation';
import { launchPages, launchWriter } from './launch.records';
import { loadActiveLaunch, loadLaunch } from './launch.read';
import { readPublicationSelection, selectionKey, selectionPointer, type SelectionRead } from './publication-selection.records';
import type { ProtocolRef } from './types';

export { readPublicationSelection, readPublicationSelectionRecord } from './publication-selection.records';
export interface PublicationSelectionInput {
  launchId: string; grant: ProtocolRef; publication: ProtocolRef; previousSelection: ProtocolRef | null;
}
function capture(input: PublicationSelectionInput): PublicationSelectionInput {
  const row = fields(input, 'launchId grant publication previousSelection'); selectionKey(row.launchId as string);
  reference(row.grant); reference(row.publication); if (row.previousSelection !== null) reference(row.previousSelection);
  return { launchId: row.launchId as string, grant: snapshotReference(row.grant), publication: snapshotReference(row.publication),
    previousSelection: row.previousSelection === null ? null : snapshotReference(row.previousSelection) };
}
export async function assertPublicationSelected(tx: { head: CanonicalHead; pages: SelectionRead }, launchId: string,
  grantRef: ProtocolRef, publicationRef: ProtocolRef) {
  const head = snapshotJson(tx.head), grant = snapshotReference(grantRef), publication = snapshotReference(publicationRef);
  const selected = await readPublicationSelection(tx.pages, launchId); check(selected, 'missing publication selection');
  const data = selected.value.data;
  check(head.status === 'ready' && selected.row.generation === head.generation && selected.row.gameId === head.gameId
    && data.owner === head.owner && data.epoch === head.epoch && selected.row.revision <= head.revision
    && equal(data.grant, grant) && equal(data.publication, publication), 'publication or grant is not selected for current custody');
  return selected;
}

/** Internal composition hook. Caller owns initial/successor grant policy; proof uses writer's launchRecords slot. */
export async function retainPublicationSelection(tx: CanonicalWork, input: CanonicalRequest, binding: PublicationSelectionInput,
  writer: Pick<ReturnType<typeof launchWriter>, 'put'>) {
  const request = validateRequest(input), head = snapshotJson(tx.head), args = capture(binding);
  check(head.status === 'ready' && sameFence(request.expected, canonicalFence(head)), 'publication selection writer custody changed');
  const previous = await readPublicationSelection(tx.pages, args.launchId);
  check(equal(previous?.ref ?? null, args.previousSelection), 'publication selection changed');
  check(!previous || !equal({ grant: previous.value.data.grant, publication: previous.value.data.publication },
    { grant: args.grant, publication: args.publication }), 'publication binding is already selected');
  const publication = await readPublication(tx.pages, args.publication); assertPublicationCurrent(publication, head);
  const pointer = await tx.pages.set('execution', selectionKey(args.launchId), selectionPointer(args.launchId, request.attemptId));
  return writer.put(selectionKey(args.launchId, request.attemptId), 'agentica-publication-selection', args.launchId,
    { grant: args.grant, publication: args.publication, previousSelection: args.previousSelection,
      owner: head.owner, epoch: head.epoch, pointerId: pointer.id });
}

/** Fresh initial-run renewal only. Exact committed retries return before rechecking later selections. */
export function executePublicationRenewal(input: CanonicalRequest, options: { signal?: AbortSignal } = {}) {
  const request = validateRequest(input), args = capture(request.input as unknown as PublicationSelectionInput);
  check(request.operation === 'agentica.publication.renew' && args.previousSelection !== null, 'invalid initial publication renewal');
  return executeCanonical(request, async tx => {
    const pages = launchPages(tx), current = await loadLaunch(pages, args.launchId), active = await loadActiveLaunch(pages);
    const grant = current.grant?.value.data;
    check(active?.id === args.launchId && active.sourceAttemptId === current.guard.admissionAttemptId
      && current.grant && equal(current.grant.ref, args.grant), 'initial launch grant is not active');
    check(tx.head.status === 'ready' && current.guard.state === 'admitted' && current.guard.owner === tx.head.owner
      && current.guard.epoch === tx.head.epoch && grant!.owner === tx.head.owner && grant!.epoch === tx.head.epoch
      && grant!.guardRevision === current.guard.revision, 'initial launch grant custody or guard changed');
    const previous = await readPublicationSelection(pages, args.launchId); check(previous, 'missing publication selection');
    await assertPublicationSelected(tx, args.launchId, args.grant, previous.value.data.publication);
    check(equal(previous.ref, args.previousSelection) && !equal(previous.value.data.publication, args.publication), 'publication selection changed');
    const publication = await readPublication(pages, args.publication);
    check(publication.wireRevision >= previous.row.revision, 'renewal publication predates the selected binding');
    const writer = launchWriter(tx, request);
    await retainPublicationSelection(tx, request, args, writer); return writer.receipt();
  }, options);
}
