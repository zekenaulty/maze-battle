// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import { canonicalFence } from '../transaction';
import type { CanonicalRecord, CanonicalRequest, JsonObject } from '../types';
import { protocolHead } from './types.test-support';
import type { Publication } from './types';
import { source } from './validation.source';
import { assertPublicationSelected } from './publication-selection';
import { readPublicationSelection, readPublicationSelectionRecord, selectionKey, selectionPointer, type SelectionRead } from './publication-selection.records';

function fixture() {
  const head = protocolHead(), launchId = 'launch', grant = { key: 'agentica/fixture/grant', id: 'grant-record' };
  const publishedHead = { ...head, revision: 4 }, published: CanonicalRequest = { attemptId: 'pub', operation: 'agentica.publish',
    input: {}, deadlineAt: null, expected: canonicalFence(publishedHead) };
  const publication: Publication = { ...source({ head: publishedHead }, published, 'agentica-publication'), kind: 'agentica-publication',
    snapshot: { generation: head.generation, gameId: head.gameId, revision: 4, checkpoint: head.checkpoint, roots: { world: null, knowledge: null } },
    wireRevision: 4, observation: null };
  const publicationRef = { key: 'agentica/publications/pub', id: 'pub-record' };
  const request: CanonicalRequest = { attemptId: 'select', operation: 'fixture.successor-grant', input: {}, deadlineAt: null,
    expected: { ...canonicalFence(head), revision: head.revision - 1 } };
  const base = { generation: head.generation, gameId: head.gameId, area: 'execution' as const, revision: head.revision, indexes: [] };
  const pointer: CanonicalRecord = { ...base, id: 'pointer', key: selectionKey(launchId), value: selectionPointer(launchId, request.attemptId) };
  const row: CanonicalRecord = { ...base, id: 'selection', key: selectionKey(launchId, request.attemptId), value: {
    schema: 1, kind: 'agentica-publication-selection', launchId, sourceAttemptId: request.attemptId,
    data: { grant, publication: publicationRef, previousSelection: null, owner: head.owner, epoch: head.epoch, pointerId: pointer.id } } as unknown as JsonObject };
  const ref = { key: row.key, id: row.id }, records = new Map([row, pointer].map(row => [row.key, row]));
  const receipt = { afterRevision: row.revision, result: { launchRecords: [{ ...ref, witness: canonicalJson(row) }], successorProof: 'composed separately' } };
  const pages = { get: vi.fn(async (_area: string, key: string) => structuredClone(records.get(key))),
    sourceReceipt: vi.fn(async () => ({ source: structuredClone(request), receipt: structuredClone(receipt) })),
    savedSnapshot: vi.fn(async () => ({ record: { id: publicationRef.id, key: publicationRef.key, indexes: [], value: publication },
      snapshot: publication.snapshot, source: published })) };
  return { head, launchId, grant, publicationRef, ref, row, pointer, records, request, receipt, pages: pages as unknown as SelectionRead };
}

describe('publication selection authority and immutable provenance', () => {
  it('reads a composed receipt without grant-policy recursion and asserts both binding refs', async () => {
    const f = fixture(); expect((await readPublicationSelection(f.pages, f.launchId))?.ref).toEqual(f.ref);
    await expect(assertPublicationSelected(f, f.launchId, f.grant, f.publicationRef)).resolves.toMatchObject({ ref: f.ref });
    await expect(assertPublicationSelected(f, f.launchId, { ...f.grant, id: 'other-grant' }, f.publicationRef)).rejects.toThrow('not selected');
    await expect(assertPublicationSelected(f, f.launchId, f.grant, { ...f.publicationRef, id: 'old-pub' })).rejects.toThrow('not selected');
  });
  it.each(['owner', 'epoch', 'generation', 'gameId', 'revision', 'status'])('read history is not authority after changed %s', async field => {
    const f = fixture();
    if (field === 'epoch') f.head.epoch++; else if (field === 'revision') f.head.revision--;
    else if (field === 'status') f.head.status = 'stopped'; else f.head[field as 'owner' | 'generation' | 'gameId'] = 'other';
    expect((await readPublicationSelectionRecord(f.pages, f.ref)).ref).toEqual(f.ref);
    await expect(assertPublicationSelected(f, f.launchId, f.grant, f.publicationRef)).rejects.toThrow('not selected');
  });
  it('missing pointer never falls back to a readable immutable selection', async () => {
    const f = fixture(); f.records.delete(f.pointer.key);
    expect(await readPublicationSelection(f.pages, f.launchId)).toBeNull();
    expect((await readPublicationSelectionRecord(f.pages, f.ref)).ref).toEqual(f.ref);
    await expect(assertPublicationSelected(f, f.launchId, f.grant, f.publicationRef)).rejects.toThrow('missing publication selection');
  });
  it.each(['pointer-id', 'pointer-value', 'selection-value', 'proof', 'source-owner'])('rejects corrupt %s', async changed => {
    const f = fixture();
    if (changed === 'pointer-id') f.pointer.id = 'replacement';
    if (changed === 'pointer-value') (f.pointer.value as JsonObject).launchId = 'other';
    if (changed === 'selection-value') ((f.row.value as JsonObject).data as JsonObject).epoch = 99;
    if (changed === 'proof') f.receipt.result.launchRecords[0].witness = '{}';
    if (changed === 'source-owner') f.request.expected.owner = 'other';
    await expect(readPublicationSelection(f.pages, f.launchId)).rejects.toThrow();
  });
  it('captures refs and current head synchronously before awaiting selection reads', async () => {
    const f = fixture(), grant = { ...f.grant }, publication = { ...f.publicationRef };
    const checked = assertPublicationSelected(f, f.launchId, grant, publication);
    grant.id = 'other'; publication.id = 'other'; f.head.owner = 'other';
    await expect(checked).resolves.toMatchObject({ ref: f.ref });
  });
});
