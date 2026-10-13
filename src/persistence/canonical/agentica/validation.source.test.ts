// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import { canonicalFence } from '../transaction';
import type { CanonicalRecord, CanonicalRequest, JsonObject } from '../types';
import { protocolHead } from './types.test-support';
import type { ProtocolRead } from './types';
import { readSource, source } from './validation.source';

function fixture() {
  const head = protocolHead(), request: CanonicalRequest = { attemptId: 'source', operation: 'fixture.action',
    expected: canonicalFence(head), input: { exact: 'input' }, deadlineAt: null };
  const value = source({ head }, request, 'agentica-action'), ref = { key: 'agentica/actions/action', id: 'record' };
  const record: CanonicalRecord = { generation: head.generation, gameId: head.gameId, area: 'execution', key: ref.key,
    id: ref.id, revision: head.revision + 1, indexes: [], value: value as unknown as JsonObject };
  const provenance = { source: request, receipt: { afterRevision: record.revision,
    result: { recordId: record.id, recordWitness: canonicalJson(record), reference: ref } } };
  const get = vi.fn(async () => structuredClone(record)), sourceReceipt = vi.fn(async () => structuredClone(provenance));
  const savedSnapshot = vi.fn(async () => { throw Error('Actions are not saved worlds'); });
  const pages = { get, sourceReceipt, savedSnapshot } as unknown as ProtocolRead;
  return { value, ref, record, provenance, get, sourceReceipt, savedSnapshot, pages };
}

describe('canonical source-receipt reuse', () => {
  it('uses the kernel provenance reader without storing or validating another snapshot', async () => {
    const f = fixture(); expect(f.value).not.toHaveProperty('snapshot');
    expect(await readSource(f.pages, f.ref, 'agentica-action', '')).toEqual(f.value);
    expect(f.get).toHaveBeenCalledWith('execution', f.ref.key);
    expect(f.sourceReceipt).toHaveBeenCalledExactlyOnceWith('source'); expect(f.savedSnapshot).not.toHaveBeenCalled();
  });
  it('propagates kernel source failures rather than manufacturing an absent or valid original', async () => {
    const f = fixture(); f.sourceReceipt.mockRejectedValueOnce(Error('malformed original receipt'));
    await expect(readSource(f.pages, f.ref, 'agentica-action', '')).rejects.toThrow('malformed original receipt');
  });
  it.each(['witness', 'id', 'revision', 'reference', 'request'])('checks protocol %s after kernel source validation', async changed => {
    const f = fixture();
    if (changed === 'witness') f.provenance.receipt.result.recordWitness = '{}';
    if (changed === 'id') f.provenance.receipt.result.recordId = 'other';
    if (changed === 'revision') f.provenance.receipt.afterRevision++;
    if (changed === 'reference') f.provenance.receipt.result.reference = { ...f.ref, id: 'other' };
    if (changed === 'request') f.provenance.source.input = { exact: 'different' };
    await expect(readSource(f.pages, f.ref, 'agentica-action', '')).rejects.toThrow();
  });
});
