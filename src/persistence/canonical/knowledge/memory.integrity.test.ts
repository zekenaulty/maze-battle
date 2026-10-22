// @vitest-environment node
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import { blockKey, localKey } from './keys';
import { loadMemoryBlock, rememberObservation, validateCellEvidence } from './memory';
import { memoryIntegrityKey } from './memory.integrity';
import { earnedCell, knowledgeFixture } from './region.test-support';
import type { MemoryBlock } from './types';

async function fixture() {
  const f = knowledgeFixture(), cells = [earnedCell(0, 0), earnedCell(0, 1, 'room', 0, 1)];
  await f.observe(cells);
  const key = blockKey(cells[0].at), proofKey = memoryIntegrityKey(key);
  return { ...f, cells, key, proofKey, read: () => loadMemoryBlock(f.pages, cells[0].at) };
}

it('commits the complete accumulated memory value and exact record identity in two bounded point reads', async () => {
  const f = await fixture(), row = f.records.get(f.key)!, proof = f.records.get(f.proofKey)!;
  expect(proof.value).toEqual({ schema: 1, recordId: row.id, revision: row.revision,
    digest: `sha256:${createHash('sha256').update(canonicalJson(row.value)).digest('hex')}` });
  expect(proof.revision).toBe(row.revision);
  f.reads.length = f.writes.length = 0;
  expect(await f.read()).toEqual(row.value); expect(f.reads).toEqual([f.key, f.proofKey]); expect(f.writes).toEqual([]);
});

it.each(['member', 'edge', 'empty', 'missing-block', 'missing-proof', 'record-id', 'revision', 'proof-revision',
  'block-key', 'proof-key', 'generation', 'game', 'digest', 'shape'] as const)('refuses %s corruption without writes or repair', async defect => {
  const f = await fixture(), row = f.records.get(f.key)!, proof = f.records.get(f.proofKey)!;
  const block = row.value as unknown as MemoryBlock;
  const value = proof.value as { schema: number; recordId: string; revision: number; digest: string };
  if (defect === 'member') delete block.cells[localKey(f.cells[1].at)];
  if (defect === 'edge') delete block.cells[localKey(f.cells[0].at)].edges.north;
  if (defect === 'empty') block.cells = {};
  if (defect === 'missing-block') f.records.delete(f.key);
  if (defect === 'missing-proof') f.records.delete(f.proofKey);
  if (defect === 'record-id') value.recordId = 'other-record';
  if (defect === 'revision') value.revision++;
  if (defect === 'proof-revision') proof.revision++;
  if (defect === 'block-key') row.key += '-other';
  if (defect === 'proof-key') proof.key += '-other';
  if (defect === 'generation') proof.generation = 'foreign';
  if (defect === 'game') proof.gameId = 'foreign';
  if (defect === 'digest') value.digest = `sha256:${'0'.repeat(64)}`;
  if (defect === 'shape') Object.assign(value, { extra: true });
  f.reads.length = f.writes.length = 0;
  await expect(f.read()).rejects.toThrow();
  expect(f.reads).toEqual([f.key, f.proofKey]); expect(f.writes).toEqual([]);
});

it('distinguishes never-created blocks from orphaned proof records', async () => {
  const f = await fixture(), at = earnedCell(0, 0, 'unseen').at, key = blockKey(at);
  f.reads.length = 0;
  expect(await loadMemoryBlock(f.pages, at)).toBeNull(); expect(f.reads).toEqual([key, memoryIntegrityKey(key)]);
  f.records.set(memoryIntegrityKey(key), structuredClone(f.records.get(f.proofKey)!));
  await expect(loadMemoryBlock(f.pages, at)).rejects.toThrow('missing memory integrity');
});

it('preserves unchanged sight identities and exact historical snapshots after a one-sided closure', async () => {
  const f = await fixture(), cells = structuredClone(f.cells); cells[0].edges.east = cells[1].at; cells[1].edges.west = cells[0].at;
  await f.observe(cells);
  const old = f.snapshot(), row = structuredClone(f.records.get(f.key)), proof = structuredClone(f.records.get(f.proofKey));
  f.writes.length = 0; await f.observe(cells);
  expect(f.records.get(f.key)).toEqual(row); expect(f.records.get(f.proofKey)).toEqual(proof);
  expect(f.writes).not.toContain(f.key); expect(f.writes).not.toContain(f.proofKey);
  const closed = structuredClone(cells[0]); closed.edges.east = null; await f.observe([closed]);
  const current = (await f.read())!;
  expect(current.cells[localKey(closed.at)].edges.east).toMatchObject({ target: null, source: { sequence: 4 } });
  expect(current.cells[localKey(cells[1].at)]).toEqual((row!.value as unknown as MemoryBlock).cells[localKey(cells[1].at)]);
  expect(f.records.get(f.key)!.id).not.toBe(row!.id); expect(f.records.get(f.proofKey)!.id).not.toBe(proof!.id);
  expect(await loadMemoryBlock(old.pages, cells[0].at)).toEqual(row!.value);
  f.records.set(f.proofKey, proof!); await expect(f.read()).rejects.toThrow('memory integrity');
});

it.each(['missing', 'tampered'] as const)('refuses %s proof before updating or resealing a previously earned block', async defect => {
  const f = await fixture();
  if (defect === 'missing') f.records.delete(f.proofKey);
  else delete (f.records.get(f.key)!.value as unknown as MemoryBlock).cells[localKey(f.cells[1].at)];
  const before = structuredClone(f.records); f.writes.length = 0;
  const changed = { ...f.cells[0], chests: [] };
  await expect(rememberObservation(f.pages, [changed], { sequence: 2, id: 'new-sight' })).rejects.toThrow('memory integrity');
  expect(f.records).toEqual(before); expect(f.writes).toEqual([]);
});

it('retains the independent source-completeness check even when a caller supplies a cell directly', async () => {
  const f = await fixture(), cell = structuredClone((await f.read())!.cells[localKey(f.cells[0].at)]);
  delete cell.edges.north;
  await expect(validateCellEvidence(cell, async () => structuredClone(f.cells[0]))).rejects.toThrow('omitted');
});
