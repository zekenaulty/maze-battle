// @vitest-environment node
import { expect, it } from 'vitest';
import { accountHead, appendedBytes } from '../accounting';
import { preparationFixture } from '../privatePreparation.test-support';
import type { CanonicalReceipt, JsonObject } from '../types';
import { fingerprint } from '../validation';
import { readPreparationLineage, retainPreparationLineage } from './preparationLineage';

async function fixture() {
  const memory = preparationFixture(); await memory.established(); const work = memory.stage();
  work.source.operation = 'save.command'; work.source.input = { kind: 'load', id: 'saved-camp' };
  const proof = await retainPreparationLineage(work, work.source.attemptId), staged = await work.pages.prepare();
  const receipt: CanonicalReceipt = { generation: work.head.generation, gameId: work.head.gameId, attemptId: work.source.attemptId,
    fingerprint: fingerprint(work.source), beforeRevision: work.head.revision, afterRevision: work.head.revision + 1,
    committedAt: '2026-10-23T00:00:00.000Z', result: { kind: 'load', id: 'saved-camp', preparationLineage: proof } };
  const head = accountHead(work.head, { ...work.head, revision: receipt.afterRevision, roots: staged.roots },
    appendedBytes(staged.records, staged.nodes, receipt));
  for (const row of staged.records) memory.records.set(row.id, row);
  for (const node of staged.nodes) memory.nodes.set(node.node.id, node);
  memory.receipts.set(receipt.attemptId, receipt);
  const row = memory.records.get(proof.recordId)!;
  return { memory, work, proof, receipt, head, row, read: () => readPreparationLineage(memory.stage(head).pages) };
}

it('uses the original identity before any restore without reading receipt history', async () => {
  const memory = preparationFixture();
  expect(await readPreparationLineage(memory.stage().pages)).toBeUndefined();
  expect(memory.reads).toEqual([]);
});

it('reads one source-bound current lineage without scanning older loads', async () => {
  const f = await fixture(); f.memory.reads.length = 0;
  expect(await f.read()).toBe(`restore-${f.head.revision}`);
  expect(f.memory.reads.filter(row => row.store === 'receipts')).toEqual([{ store: 'receipts', id: f.receipt.attemptId }]);
});

it.each(['schema', 'extra', 'revision', 'indexes', 'source', 'proof', 'recordId', 'witness', 'operation', 'kind', 'input-extra'])(
  'refuses changed lineage provenance: %s', async change => {
    const f = await fixture(), value = f.row.value as JsonObject, result = f.receipt.result as JsonObject;
    if (change === 'schema') value.schema = 2;
    if (change === 'extra') value.extra = true;
    if (change === 'revision') value.revision = f.head.revision + 1;
    if (change === 'indexes') f.row.indexes.push('foreign/lineage');
    if (change === 'source') value.sourceAttemptId = 'missing';
    if (change === 'proof') delete result.preparationLineage;
    if (change === 'recordId') (result.preparationLineage as JsonObject).recordId = 'foreign';
    if (change === 'witness') (result.preparationLineage as JsonObject).witness = '{}';
    if (['operation', 'kind', 'input-extra'].includes(change)) {
      if (change === 'operation') f.work.source.operation = 'fixture.forged-load';
      if (change === 'kind') f.work.source.input = { kind: 'delete', id: 'saved-camp' };
      if (change === 'input-extra') f.work.source.input = { kind: 'load', id: 'saved-camp', extra: true };
      f.receipt.fingerprint = fingerprint(f.work.source);
    }
    await expect(f.read()).rejects.toThrow();
  });
