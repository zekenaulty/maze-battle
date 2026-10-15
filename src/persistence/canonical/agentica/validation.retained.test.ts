// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import { canonicalFence } from '../transaction';
import type { CanonicalRecord, CanonicalRequest, JsonObject } from '../types';
import type { PendingAction, ProtocolRead } from './types';
import { protocolAction, protocolHead } from './types.test-support';
import { prepareAction, restoreRetainedAction, snapshotPrepared, validatePrepared } from './validation';

async function fixture() {
  const head = protocolHead(), identity = await prepareAction(protocolAction());
  const binding = { grant: { key: 'agentica/launch/grant', id: 'grant' }, publication: { key: 'agentica/publication', id: 'publication' } };
  const request: CanonicalRequest = { attemptId: 'reserve', operation: 'agentica.action.reserve', expected: canonicalFence(head),
    input: { action: identity.storageKey, ...binding }, deadlineAt: null };
  const value: PendingAction = { schema: 1, kind: 'agentica-action', sourceAttemptId: request.attemptId, sourceRequest: request,
    owner: head.owner, epoch: head.epoch, key: identity.key, fingerprint: identity.fingerprint, action: structuredClone(identity.action),
    publication: binding.publication, effect: 'writesLocalState' };
  const ref = { key: identity.storageKey, id: 'pending' };
  const row: CanonicalRecord = { generation: head.generation, gameId: head.gameId, area: 'execution', key: ref.key,
    id: ref.id, revision: head.revision + 1, indexes: [], value: value as unknown as JsonObject };
  const proof = () => ({ source: request, receipt: { afterRevision: row.revision,
    result: { recordId: row.id, recordWitness: canonicalJson(row), reference: ref } } });
  const get = vi.fn(async () => structuredClone(row)), sourceReceipt = vi.fn(async () => structuredClone(proof()));
  const pages = { get, sourceReceipt, savedSnapshot: vi.fn() } as unknown as ProtocolRead;
  return { identity, binding, request, value, ref, row, pages, sourceReceipt };
}

describe('source-proven action identity restoration', () => {
  it('reads committed proof, owns nested data, and preserves mutation detection without another digest', async () => {
    const f = await fixture(), digest = vi.spyOn(crypto.subtle, 'digest');
    try {
      const restored = await restoreRetainedAction(f.pages, f.ref, f.binding), copy = snapshotPrepared(restored);
      expect(restored).toEqual(f.identity); expect(digest).not.toHaveBeenCalled();
      expect(f.sourceReceipt).toHaveBeenCalledExactlyOnceWith('reserve');
      f.value.action.arguments.row = 88; expect(restored.action.arguments.row).toBe(-5);
      restored.action.arguments.row = 99; expect(() => validatePrepared(restored)).toThrow('prepare');
      expect(() => validatePrepared(copy)).not.toThrow(); expect(copy.action.arguments.row).toBe(-5);
      expect(() => validatePrepared({ ...copy })).toThrow('prepare');
    } finally { digest.mockRestore(); }
  });
  it.each(['operation', 'storage-key', 'action-key', 'fingerprint', 'grant', 'publication', 'pending-publication'])
    ('rejects a source-consistent but semantically changed %s', async changed => {
      const f = await fixture(), binding = structuredClone(f.binding), args = f.request.input as JsonObject;
      if (changed === 'operation') f.request.operation = 'other';
      if (changed === 'storage-key') args.action = `agentica/actions/${'f'.repeat(64)}`;
      if (changed === 'action-key') f.value.key = 'other';
      if (changed === 'fingerprint') f.value.fingerprint = '{}';
      if (changed === 'grant') binding.grant.id = 'other';
      if (changed === 'publication') binding.publication.id = 'other';
      if (changed === 'pending-publication') f.value.publication = { ...f.binding.publication, id: 'other' };
      await expect(restoreRetainedAction(f.pages, f.ref, binding)).rejects.toThrow('identity changed');
    });
  it('does not brand a copied or mismatched source reference', async () => {
    const f = await fixture();
    await expect(restoreRetainedAction(f.pages, { ...f.ref, id: 'copy' }, f.binding)).rejects.toThrow();
    f.sourceReceipt.mockRejectedValueOnce(Error('missing immutable receipt'));
    await expect(restoreRetainedAction(f.pages, f.ref, f.binding)).rejects.toThrow('missing immutable receipt');
  });
  it('captures references and binding before the first read yields', async () => {
    const f = await fixture(), ref = { ...f.ref }, binding = structuredClone(f.binding);
    const restoring = restoreRetainedAction(f.pages, ref, binding);
    ref.id = 'other'; binding.grant.id = 'other'; binding.publication.id = 'other';
    expect(await restoring).toEqual(f.identity);
  });
});
