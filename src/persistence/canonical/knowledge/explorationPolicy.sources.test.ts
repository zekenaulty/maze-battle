// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compareExplorationObservation } from './explorationPolicy';
import { comparison, floorCell } from './explorationPolicy.test-support';
import { observationKey } from './keys';
import { loadObservation } from './evidence';
import type { ObservationChunk, ObservationHeader } from './types';

async function retainedSource() {
  const history = Array.from({ length: 49 }, (_, i) => floorCell(i));
  return comparison([history[0]], [history[0], history[32]], history);
}

describe('exploration exact selected historical evidence', () => {
  it('deduplicates source keys and loads only selected historical chunks', async () => {
    const f = await retainedSource(), original = structuredClone(f.before.records);
    expect(await f.read()).toBeNull();
    const reads = [...f.before.reads];
    expect(new Set(reads).size).toBe(reads.length);
    for (const suffix of ['', '/integrity', '/0', '/2']) expect(reads).toContain(`${observationKey(1)}${suffix}`);
    for (const suffix of ['/1', '/3']) expect(reads).not.toContain(`${observationKey(1)}${suffix}`);
    expect(f.before.records).toEqual(original); expect(f.before.writes).toEqual([]);
  });

  it.each(['header-id', 'missing-header', 'missing-selected-chunk', 'chunk-id', 'revision', 'sequence',
    'extra-field', 'foreign-floor', 'duplicate-cell', 'nonreciprocal-edge', 'actor-coverage'] as const)
  ('rejects historical %s before returning quiet or an early discovery', async kind => {
    for (const discovery of [false, true]) {
      const f = await retainedSource(), rows = f.before.records, key = observationKey(1);
      const header = rows.get(key)!, part = rows.get(`${key}/2`)!;
      const chunk = part.value as unknown as ObservationChunk;
      if (kind === 'header-id') header.id = 'replaced';
      if (kind === 'missing-header') rows.delete(key);
      if (kind === 'missing-selected-chunk') rows.delete(`${key}/2`);
      if (kind === 'chunk-id') part.id = 'replaced';
      if (kind === 'revision') part.revision++;
      if (kind === 'sequence') chunk.sequence++;
      if (kind === 'extra-field') Object.assign(chunk, { hidden: true });
      if (kind === 'foreign-floor') chunk.cells[0].at.level = 2;
      if (kind === 'duplicate-cell') chunk.cells[1] = structuredClone(chunk.cells[0]);
      if (kind === 'nonreciprocal-edge') chunk.cells[0].edges.east = chunk.cells[1].at;
      if (kind === 'actor-coverage') (header.value as unknown as ObservationHeader).actor = floorCell(99).at;
      if (discovery) f.cells[0].chests = [{ id: 'new', opened: false }];
      await expect(f.read()).rejects.toThrow(); expect(f.before.writes).toEqual([]);
    }
  });

  it('does not reuse a previous comparison after same-ID source bytes are corrupted', async () => {
    const f = await retainedSource(); expect(await f.read()).toBeNull();
    const key = `${observationKey(1)}/2`, row = f.before.records.get(key)!, id = row.id;
    (row.value as unknown as ObservationChunk).cells[0].edges.east = floorCell(99).at;
    f.before.reads.length = 0;
    await expect(compareExplorationObservation(f.before.pages, f.before.checkpoint(), f.cells, 'room'))
      .rejects.toThrow('integrity');
    expect(f.before.reads).toContain(key); expect(row.id).toBe(id); expect(f.before.writes).toEqual([]);
  });
  it('defers an unread historical chunk to full audit, never an already loaded manifest', async () => {
    const f = await retainedSource(), key = observationKey(1), header = f.before.records.get(key)!;
    f.before.records.delete(`${key}/1`);
    expect(await f.read()).toBeNull();
    await expect(loadObservation(f.before.pages, { sequence: 1, id: header.id })).rejects.toThrow();
    (f.before.records.get(`${key}/integrity`)!.value as { chunkDigests: string[] }).chunkDigests[1] = `sha256:${'0'.repeat(64)}`;
    await expect(f.read()).rejects.toThrow('integrity');
  });
});
