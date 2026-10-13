// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { canonicalFence } from '../transaction';
import type { CanonicalWork } from '../transaction';
import type { CanonicalRequest } from '../types';
import { assertPublicationCurrent, readPublication } from './publication';
import { source } from './validation';
import { protocolHead } from './types.test-support';
import type { ProtocolRead, Publication } from './types';

function fixture() {
  const head = protocolHead(), request: CanonicalRequest = { expected: canonicalFence(head), attemptId: 'publication', operation: 'fixture.publish', input: {}, deadlineAt: null };
  const anchor = source({ head } as CanonicalWork, request, 'agentica-publication');
  const publication: Publication = { ...anchor, kind: 'agentica-publication', wireRevision: head.revision, observation: null };
  const ref = { key: 'agentica/publications/publication', id: 'record' };
  const stored = { record: { id: ref.id, key: ref.key, indexes: [], value: publication }, snapshot: publication.snapshot, source: request };
  const pages = { savedSnapshot: vi.fn(async () => structuredClone(stored)) } as unknown as ProtocolRead;
  return { head, request, publication, ref, stored, pages };
}
describe('retained publication scope', () => {
  it('pins world/knowledge/checkpoint despite newer execution bookkeeping', () => {
    const f = fixture();
    expect(() => assertPublicationCurrent(f.publication, { ...f.head, revision: 20, roots: { ...f.head.roots, execution: 'new-bookkeeping' } })).not.toThrow();
    expect(f.publication.wireRevision).toBe(7); expect(f.publication.snapshot.roots).not.toHaveProperty('execution');
  });
  it.each(['world', 'knowledge', 'checkpoint', 'owner', 'epoch', 'generation', 'gameId', 'status', 'revision'])('rejects changed %s', field => {
    const f = fixture(), head = structuredClone(f.head);
    if (field === 'world' || field === 'knowledge') head.roots[field] = 'different';
    else if (field === 'checkpoint') head.checkpoint.wave = 2;
    else if (field === 'epoch') head.epoch++;
    else if (field === 'revision') head.revision--;
    else if (field === 'status') head.status = 'stopped';
    else if (field === 'owner' || field === 'gameId' || field === 'generation') head[field] = 'other';
    expect(() => assertPublicationCurrent(f.publication, head)).toThrow('custody');
  });
  it('requires the full writer fence and bounded original source request', () => {
    const f = fixture();
    expect(() => source({ head: f.head } as CanonicalWork, { ...f.request, expected: { ...f.request.expected, revision: 3 } }, 'agentica-publication')).toThrow();
    expect(() => source({ head: f.head } as CanonicalWork, { ...f.request, input: { text: 'x'.repeat(2048) } }, 'agentica-publication')).toThrow();
  });
  it('validates source identity, original request and observation even after source receipt resolution', async () => {
    const f = fixture(); expect(await readPublication(f.pages, f.ref)).toEqual(f.publication);
    f.stored.source = { ...f.request, input: { changed: true } };
    await expect(readPublication(f.pages, f.ref)).rejects.toThrow('custody');
    f.stored.source = f.request; f.publication.observation = { sequence: 1, id: 'forged', witness: 'fake' };
    await expect(readPublication(f.pages, f.ref)).rejects.toThrow();
  });
  it('never masks a missing or malformed referenced record as null', async () => {
    const f = fixture(); vi.mocked(f.pages.savedSnapshot).mockRejectedValueOnce(Error('missing referenced record'));
    await expect(readPublication(f.pages, f.ref)).rejects.toThrow('missing referenced record');
    f.stored.record.value = { ...f.publication, wireRevision: 999 };
    await expect(readPublication(f.pages, f.ref)).rejects.toThrow('identity');
    await expect(readPublication(f.pages, { ...f.ref, id: 'different' })).rejects.toThrow('reference');
  });
});
