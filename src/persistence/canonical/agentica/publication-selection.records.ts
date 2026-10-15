import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import { fields } from '../roster/codec';
import { check, integer, isObject, jsonBytes, validId } from '../validation';
import { equal, reference, snapshotReference } from './validation';
import { readPublication } from './publication';
import type { LaunchRead, LoadedLaunchRecord } from './launch.types';
import type { ProtocolRef } from './types';

export interface PublicationSelection {
  grant: ProtocolRef; publication: ProtocolRef; previousSelection: ProtocolRef | null;
  owner: string; epoch: number; pointerId: string;
}
export type SelectedPublication = LoadedLaunchRecord<PublicationSelection>;
export type SelectionRead = Pick<LaunchRead, 'get' | 'sourceReceipt' | 'savedSnapshot'>;
export const selectionKey = (launchId: string, attemptId?: string) => {
  check(validId(launchId) && (attemptId === undefined || validId(attemptId)), 'invalid publication selection identity');
  return `agentica/publication-selections/${launchId}/${attemptId === undefined ? 'current' : `entries/${attemptId}`}`;
};
export const selectionPointer = (launchId: string, attemptId: string) => ({ schema: 1, kind: 'agentica-publication-current',
  launchId, sourceAttemptId: attemptId, selectionKey: selectionKey(launchId, attemptId) });

/** Immutable history, independent of the current pointer or any grant's policy. */
export async function readPublicationSelectionRecord(pages: SelectionRead, input: ProtocolRef): Promise<SelectedPublication> {
  const ref = snapshotReference(input), row = await pages.get('execution', ref.key);
  check(row && row.id === ref.id && row.indexes.length === 0, 'missing or replaced publication selection');
  const value = fields(row.value, 'schema kind launchId sourceAttemptId data');
  check(value.schema === 1 && value.kind === 'agentica-publication-selection'
    && ref.key === selectionKey(value.launchId as string, value.sourceAttemptId as string), 'publication selection identity changed');
  const data = fields(value.data, 'grant publication previousSelection owner epoch pointerId');
  reference(data.grant); reference(data.publication);
  if (data.previousSelection !== null) reference(data.previousSelection);
  check(validId(data.owner) && integer(data.epoch, 1) && validId(data.pointerId), 'invalid publication selection custody');
  const { receipt, source } = await pages.sourceReceipt(value.sourceAttemptId as string);
  check(isObject(receipt.result) && Array.isArray(receipt.result.launchRecords)
    && receipt.result.launchRecords.length > 0 && receipt.result.launchRecords.length <= 3, 'missing publication selection proof');
  jsonBytes(receipt.result.launchRecords, 12 * 1024);
  const proofs = receipt.result.launchRecords.filter(p => isObject(p) && p.key === ref.key);
  check(proofs.length === 1 && equal(proofs[0], { ...ref, witness: canonicalJson(row) })
    && receipt.afterRevision === row.revision && source.attemptId === value.sourceAttemptId
    && source.expected.owner === data.owner && source.expected.epoch === data.epoch, 'publication selection source changed');
  const publication = await readPublication(pages, data.publication);
  check(publication.owner === data.owner && publication.epoch === data.epoch
    && publication.snapshot.generation === row.generation && publication.snapshot.gameId === row.gameId
    && publication.wireRevision <= source.expected.revision, 'selected publication source changed');
  return { ref, row, value: structuredClone(value) as unknown as SelectedPublication['value'], source };
}

/** Reading a selected binding neither creates nor renews execution authority. */
export async function readPublicationSelection(pages: SelectionRead, launchId: string): Promise<SelectedPublication | null> {
  const pointer = await pages.get('execution', selectionKey(launchId));
  if (!pointer) return null;
  const value = fields(pointer.value, 'schema kind launchId sourceAttemptId selectionKey');
  check(equal(value, selectionPointer(launchId, value.sourceAttemptId as string)) && pointer.indexes.length === 0,
    'publication selection pointer changed');
  const row = await pages.get('execution', value.selectionKey as string); check(row, 'missing selected publication record');
  const selected = await readPublicationSelectionRecord(pages, { key: row.key, id: row.id });
  check(selected.value.data.pointerId === pointer.id && selected.row.revision === pointer.revision
    && selected.value.launchId === launchId, 'publication selection pointer source changed');
  return selected;
}
