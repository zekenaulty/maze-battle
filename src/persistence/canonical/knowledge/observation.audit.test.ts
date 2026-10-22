// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { loadObservation as readCompleteObservation } from './evidence';
import { observationFixture } from './observation.test-support';
import type { ObservationChunk, ObservationHeader } from './types';

// These whole-history assertions previously belonged to per-step exploration source reads.
// They remain mandatory on complete observation load/audit, including unselected chunks.
describe('complete original observation audit', () => {
  it('validates every original chunk without writes', async () => {
    const f = await observationFixture(), original = structuredClone(f.records);
    expect((await readCompleteObservation(f.pages, { sequence: 1, id: f.parent.id })).cells).toEqual(f.cells);
    expect(f.reads).toEqual([f.key, f.proof.key, `${f.key}/0`, `${f.key}/1`, `${f.key}/2`]);
    expect(f.records).toEqual(original); expect(f.writes).toEqual([]);
  });

  it.each(['header-id', 'missing-header', 'missing-unselected-chunk', 'chunk-id', 'revision', 'sequence',
    'extra-field', 'foreign-floor', 'duplicate-cell', 'nonreciprocal-edge', 'actor-coverage'] as const)
  ('rejects historical %s even outside selected sources', async kind => {
    const f = await observationFixture(), header = f.records.get(f.key)!, part = f.records.get(`${f.key}/1`)!;
    const chunk = part.value as unknown as ObservationChunk;
    if (kind === 'header-id') header.id = 'replaced';
    if (kind === 'missing-header') f.records.delete(f.key);
    if (kind === 'missing-unselected-chunk') f.records.delete(part.key);
    if (kind === 'chunk-id') part.id = 'replaced';
    if (kind === 'revision') part.revision++;
    if (kind === 'sequence') chunk.sequence++;
    if (kind === 'extra-field') Object.assign(chunk, { hidden: true });
    if (kind === 'foreign-floor') chunk.cells[0].at.level = 2;
    if (kind === 'duplicate-cell') chunk.cells[1] = structuredClone(chunk.cells[0]);
    if (kind === 'nonreciprocal-edge') chunk.cells[0].edges.east = chunk.cells[1].at;
    if (kind === 'actor-coverage') (header.value as unknown as ObservationHeader).actor.cell.column = 99;
    await expect(readCompleteObservation(f.pages, { sequence: 1, id: f.parent.id })).rejects.toThrow();
    expect(f.writes).toEqual([]);
  });

  it('does not trust prior successful audit after same-ID corruption', async () => {
    const f = await observationFixture(), ref = { sequence: 1, id: f.parent.id };
    await readCompleteObservation(f.pages, ref);
    (f.records.get(`${f.key}/1`)!.value as unknown as ObservationChunk).cells[0].edges.east = f.cells[17].at;
    f.reads.length = 0;
    await expect(readCompleteObservation(f.pages, ref)).rejects.toThrow('integrity');
    expect(f.reads).toContain(`${f.key}/1`); expect(f.writes).toEqual([]);
  });
});
