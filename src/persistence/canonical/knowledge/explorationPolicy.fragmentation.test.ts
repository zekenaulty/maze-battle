// @vitest-environment node
import { expect, it } from 'vitest';
import type { CanonicalRecord } from '../types';
import { explorationPages, MAX_EXPLORATION_READS, MAX_EXPLORATION_READ_BYTES } from './explorationPolicy.read';
import { observationFixture } from './observation.test-support';
import { selectiveSourceReader } from './observation.source';
import type { CellSource, KnowledgeRead } from './types';

it('refuses highly fragmented selected evidence at the unchanged read bound, without scanning or returning invented data', async () => {
  const records = new Map<string, CanonicalRecord>(), sources: CellSource[] = [], reads: string[] = [];
  for (let sequence = 1; sequence <= 86; sequence++) {
    const f = await observationFixture(1, sequence);
    for (const [key, row] of f.records) records.set(key, row);
    sources.push({ sequence, id: f.parent.id, index: 0 });
  }
  const original = structuredClone(records), pages: KnowledgeRead = {
    async get(area, key) { expect(area).toBe('knowledge'); reads.push(key); return structuredClone(records.get(key)); },
    async witness() { throw Error('unexpected witness'); }, async scan() { throw Error('unexpected scan'); },
  };
  const read = selectiveSourceReader(explorationPages(pages));
  for (const source of sources.slice(0, 85)) expect(await read(source)).toHaveProperty('at');
  expect(reads).toHaveLength(255);
  await expect(read(sources[85])).rejects.toThrow('exploration read budget exhausted');
  expect(reads).toHaveLength(MAX_EXPLORATION_READS); expect(records).toEqual(original);
});

it('charges aggregate bytes rather than merely bounding each individual evidence record', async () => {
  let reads = 0;
  const pages = explorationPages({ async get() { reads++; return { value: 'x'.repeat(65500) } as CanonicalRecord; },
    async witness() { return null; }, async scan() { throw Error('unexpected scan'); } });
  for (let i = 0; i < 16; i++) await pages.get('knowledge', `part/${i}`);
  await expect(pages.get('knowledge', 'part/16')).rejects.toThrow('exploration byte budget exhausted');
  expect(reads).toBe(17); expect(MAX_EXPLORATION_READ_BYTES).toBe(1024 * 1024);
});
