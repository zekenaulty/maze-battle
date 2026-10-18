// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { canonicalFence, type CanonicalWork } from '../transaction';
import type { CanonicalRequest } from '../types';
import { protocolHead } from './types.test-support';
import { loadOperationRecord, writeOperationRecord } from './operation.records';
import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import type { OperationRead } from './operation.types';

it('bounds escaped full-record source witness, not merely the raw record', async () => {
  const head = protocolHead(), request: CanonicalRequest = { operation: 'agentica.operation.confirm', attemptId: 'confirm', input: {},
    expected: canonicalFence(head), deadlineAt: null };
  const set = vi.fn(async (_area, key, value) => ({ generation: head.generation, gameId: head.gameId, id: 'record', key,
    area: 'execution', indexes: [], revision: head.revision + 1, value }));
  const tx = { head, pages: { get: vi.fn(async () => null), set } } as unknown as CanonicalWork;
  await expect(writeOperationRecord(tx, request, 'agentica/operations/test/confirmation', 'fixture', { text: '"'.repeat(3500) })).rejects.toThrow('12288 bytes');
  expect(set).toHaveBeenCalledOnce();
  // The enclosing canonical transaction aborts this staged write; native store-failure tests cover that boundary.
});

function sourceFixture() {
  const head = protocolHead(), data = { intent: { key: 'intent', id: 'intent' }, started: {}, usage: {},
    state: 'waking', settledUsage: null, stopped: false };
  const row = { gameId: head.gameId, generation: head.generation, id: 'claim', area: 'execution', key: 'claim',
    revision: 4, indexes: [], value: { schema: 1, kind: 'agentica-decision-claim', sourceAttemptId: 'source', data } };
  const result = { agenticaOperation: { key: row.key, id: row.id, recordWitness: canonicalJson(row) },
    claimedParent: { key: 'agentica/claimed-parents/root', id: 'pointer', recordWitness: 'locator proof' } };
  const receipt = { afterRevision: 4, result };
  const get = vi.fn(async () => row), sourceReceipt = vi.fn(async () => ({ receipt, source: { attemptId: 'source' } }));
  const pages = { get, sourceReceipt } as unknown as OperationRead;
  const load = () => loadOperationRecord(pages, row.key, row.value.kind);
  return { data, row, receipt, result, pages, get, sourceReceipt, load };
}

it('keeps claim data unchanged and returns its exact shared source receipt without extra reads', async () => {
  const f = sourceFixture(), claim = await f.load();
  expect(claim!.data).toEqual(f.data); expect(claim!.receipt).toEqual(f.receipt);
  expect(f.get).toHaveBeenCalledOnce(); expect(f.sourceReceipt.mock.calls).toEqual([['source']]);
});
it('validates claim authority independently of optional discovery evidence', async () => {
  const f = sourceFixture(); Reflect.deleteProperty(f.result, 'claimedParent');
  expect((await f.load())!.data).toEqual(f.data);
  expect(f.get).toHaveBeenCalledOnce(); expect(f.sourceReceipt).toHaveBeenCalledOnce();
});
it.each(['extra field', 'claim witness', 'claim revision', 'null companion', 'extra companion field', 'invalid companion id'])
('refuses damaged claim receipt: %s', async damage => {
  const f = sourceFixture();
  if (damage === 'extra field') Object.assign(f.result, { unrecognized: null });
  if (damage === 'claim witness') f.result.agenticaOperation.recordWitness = '{}';
  if (damage === 'claim revision') f.receipt.afterRevision++;
  if (damage === 'null companion') Object.assign(f.result, { claimedParent: null });
  if (damage === 'extra companion field') Object.assign(f.result.claimedParent, { unrecognized: null });
  if (damage === 'invalid companion id') f.result.claimedParent.id = '../foreign';
  await expect(f.load()).rejects.toThrow();
});
it('does not loosen unrelated operation receipt envelopes', async () => {
  const f = sourceFixture();
  f.row.value.kind = 'agentica-operation-confirmation';
  f.result.agenticaOperation.recordWitness = canonicalJson(f.row);
  await expect(f.load()).rejects.toThrow('fields');
  Reflect.deleteProperty(f.result, 'claimedParent');
  expect((await f.load())!.data).toEqual(f.data);
});
