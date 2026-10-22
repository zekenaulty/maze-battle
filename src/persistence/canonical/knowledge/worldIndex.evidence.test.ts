// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import { jsonBytes } from '../validation';
import type { Json } from '../types';
import { earnedCell, knowledgeFixture } from './region.test-support';
import { indexObservedWorldCells, loadWorldIndexBlock, worldBlockKey, worldCellKey, type WorldIndexBlock } from './worldIndex';
import { worldIndexDigest, worldIndexEvidenceKey } from './worldIndex.evidence';

async function fixture() {
  const f = knowledgeFixture(), cells = [earnedCell(0, 0), earnedCell(0, 1, 'other-room')];
  await f.observe(cells);
  const key = worldBlockKey(1, cells[0].world), proofKey = worldIndexEvidenceKey(key);
  const read = () => loadWorldIndexBlock(f.pages, 1, cells[0].world);
  return { ...f, cells, key, proofKey, read };
}

describe('complete spatial-block integrity evidence', () => {
  it('writes an exact bounded companion with the block, without changing the block shape', async () => {
    const f = await fixture(), block = f.records.get(f.key)!, proof = f.records.get(f.proofKey)!;
    expect(proof.revision).toBe(block.revision);
    expect(proof.value).toEqual({ schema: 1, recordId: block.id, revision: block.revision,
      digest: `sha256:${createHash('sha256').update(canonicalJson(block.value)).digest('hex')}` });
    expect(Object.keys(block.value as object).sort()).toEqual(['cells', 'column', 'floor', 'row', 'schema']);
    f.reads.length = f.writes.length = 0;
    expect(await f.read()).toEqual(block.value);
    expect(f.reads).toEqual([f.key, f.proofKey]); expect(f.writes).toEqual([]);
  });
  it.each(['omitted-member', 'emptied-block', 'missing-block', 'missing-proof', 'wrong-record', 'wrong-revision',
    'proof-revision', 'wrong-digest', 'wrong-proof-shape', 'legacy-body-proof'] as const)('refuses %s without scans or memory discovery', async damage => {
    const f = await fixture(), block = f.records.get(f.key)!, proof = f.records.get(f.proofKey)!;
    const value = proof.value as unknown as { schema: number; recordId: string; revision: number; digest: string };
    if (damage === 'omitted-member') delete (block.value as unknown as WorldIndexBlock).cells[worldCellKey(f.cells[1].world)];
    if (damage === 'emptied-block') (block.value as unknown as WorldIndexBlock).cells = {};
    if (damage === 'missing-block') f.records.delete(f.key);
    if (damage === 'missing-proof') f.records.delete(f.proofKey);
    if (damage === 'wrong-record') value.recordId = 'other-record';
    if (damage === 'wrong-revision') value.revision++;
    if (damage === 'proof-revision') proof.revision++;
    if (damage === 'wrong-digest') value.digest = `sha256:${'0'.repeat(64)}`;
    if (damage === 'wrong-proof-shape') Object.assign(value, { ignored: true });
    if (damage === 'legacy-body-proof') { Reflect.deleteProperty(value, 'digest'); Object.assign(value, { witness: canonicalJson(block.value) }); }
    f.reads.length = f.writes.length = 0;
    await expect(f.read()).rejects.toThrow();
    expect(f.reads).toEqual([f.key, f.proofKey]); expect(f.writes).toEqual([]);
  });
  it('accepts a never-indexed block only when neither block nor companion exists', async () => {
    const f = await fixture(), world = { row: 100, column: 100 }, key = worldBlockKey(1, world);
    f.reads.length = 0;
    expect(await loadWorldIndexBlock(f.pages, 1, world)).toBeNull();
    expect(f.reads).toEqual([key, worldIndexEvidenceKey(key)]);
    f.records.set(worldIndexEvidenceKey(key), structuredClone(f.records.get(f.proofKey)!));
    await expect(loadWorldIndexBlock(f.pages, 1, world)).rejects.toThrow('missing spatial index');
  });
  it('preserves unchanged pairs and validates old snapshots after a legitimate block update', async () => {
    const f = await fixture(), old = f.snapshot(), block = structuredClone(f.records.get(f.key)), proof = structuredClone(f.records.get(f.proofKey));
    f.writes.length = 0; await f.observe(f.cells);
    expect(f.records.get(f.key)).toEqual(block); expect(f.records.get(f.proofKey)).toEqual(proof);
    expect(f.writes).not.toContain(f.key); expect(f.writes).not.toContain(f.proofKey);
    const changed = { ...f.cells[0], chests: [{ id: 'chest', opened: true }] }; await f.observe([changed]);
    const updated = await f.read(); expect(updated!.cells['0:0'].source.sequence).toBe(3);
    expect(f.records.get(f.key)!.id).not.toBe(block!.id); expect(f.records.get(f.proofKey)!.id).not.toBe(proof!.id);
    expect(await loadWorldIndexBlock(old.pages, 1, f.cells[0].world)).toEqual(block!.value);
    f.records.set(f.proofKey, proof!); await expect(f.read()).rejects.toThrow('integrity');
  });
  it('does not heal a corrupt block or missing proof during a later observation update', async () => {
    for (const missingProof of [false, true]) {
      const f = await fixture();
      if (missingProof) f.records.delete(f.proofKey);
      else delete (f.records.get(f.key)!.value as unknown as WorldIndexBlock).cells['0:1'];
      const block = structuredClone(f.records.get(f.key)), proof = structuredClone(f.records.get(f.proofKey));
      f.writes.length = 0;
      await expect(indexObservedWorldCells(f.pages, [f.cells[0]])).rejects.toThrow('integrity');
      expect(f.records.get(f.key)).toEqual(block); expect(f.records.get(f.proofKey)).toEqual(proof); expect(f.writes).toEqual([]);
    }
  });
  it('requires the companion write to succeed rather than publishing partial integrity evidence', async () => {
    const f = knowledgeFixture(), set = f.pages.set.bind(f.pages);
    f.pages.set = async (area, key, value, indexes) => {
      if (key.startsWith('perception/world/') && key.endsWith('/integrity')) throw new DOMException('Injected proof failure', 'QuotaExceededError');
      return set(area, key, value, indexes);
    };
    await expect(f.observe([earnedCell()])).rejects.toThrow('Injected proof failure');
    expect(f.checkpoint().knowledge).toBeNull();
    // Native canonical transactions, not this in-memory fixture, own rollback of staged writes.
    await expect(loadWorldIndexBlock(f.pages, 1, earnedCell().world)).rejects.toThrow('integrity');
  });
  it('fits full 16-cell blocks with maximal cell/source IDs inside the unchanged record bound', async () => {
    const f = knowledgeFixture(), long = 'x'.repeat(128);
    const cells = Array.from({ length: 16 }, (_, i) => earnedCell(Math.floor(i / 4), i % 4, long, Math.floor(i / 4), i % 4));
    await f.observe(cells);
    const key = worldBlockKey(1, cells[0].world), block = f.records.get(key)!.value as unknown as WorldIndexBlock;
    // Size qualification only, with worst-case retained source identifiers and safe sequence values.
    for (const cell of Object.values(block.cells)) cell.source = { ...cell.source, id: long, sequence: Number.MAX_SAFE_INTEGER };
    const value = { schema: 1, recordId: long, revision: Number.MAX_SAFE_INTEGER, digest: worldIndexDigest(block as unknown as Json) };
    expect(jsonBytes(value)).toBeLessThan(300);
    expect(value.digest).toBe(`sha256:${createHash('sha256').update(canonicalJson(block)).digest('hex')}`);
  });
  const vectors: Json[] = [null, {}, { b: 2, a: 1 }, { text: '\u754c\\"\n', list: Array.from({ length: 113 }, (_, i) => i) }];
  it.each(vectors)
  ('computes a synchronous canonical SHA-256 commitment matching Node crypto for %j', value => {
    expect(worldIndexDigest(value)).toBe(`sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`);
  });
});
