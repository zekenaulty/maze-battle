// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ObservationChunk, ObservationHeader } from './types';
import { observationFixture } from './observation.test-support';
import { loadObservation as readCompleteObservation, sourceReader as selectiveSourceReader } from './evidence';
import { retainObservationIntegrity } from './observation.integrity';

async function full(f: Awaited<ReturnType<typeof observationFixture>>) {
  return (await readCompleteObservation(f.pages, { sequence: 1, id: f.parent.id })).cells;
}

describe('selected immutable observation sources', () => {
  it('rejects a changed unselected digest in the loaded manifest', async () => {
    const f = await observationFixture(), proof = f.records.get(f.proof.key)!;
    (proof.value as { chunkDigests: string[] }).chunkDigests[1] = `sha256:${'0'.repeat(64)}`;
    await expect(selectiveSourceReader(f.pages)({ sequence: 1, id: f.parent.id, index: 0 })).rejects.toThrow('integrity');
    expect(f.reads).toEqual([f.key, f.proof.key]);
  });

  it('matches complete audit, selects boundary chunks and deduplicates within one reader', async () => {
    const f = await observationFixture(), all = await full(f), read = selectiveSourceReader(f.pages);
    f.reads.length = 0;
    for (const index of [0, 15, 16, 31, 32, 0]) expect(await read({ sequence: 1, id: f.parent.id, index })).toEqual(all[index]);
    expect(f.reads).toEqual([f.key, f.proof.key, `${f.key}/0`, `${f.key}/1`, `${f.key}/2`]);
    expect(f.writes).toEqual([]);
  });

  it.each(['missing', 'id', 'key', 'gameId', 'generation', 'area', 'indexes', 'extra-envelope', 'revision',
    'schema', 'sequence', 'offset', 'count', 'extra-field', 'foreign-floor', 'same-id-data', 'same-id-edge'] as const)
  ('rejects selected chunk %s without falling back or reading other chunks', async kind => {
    const f = await observationFixture(), row = f.records.get(`${f.key}/1`)!, chunk = row.value as unknown as ObservationChunk;
    if (kind === 'missing') f.records.delete(row.key);
    else if (['id', 'key', 'gameId', 'generation', 'area'].includes(kind)) Object.assign(row, { [kind]: 'foreign' });
    else if (kind === 'indexes') row.indexes = ['extra'];
    else if (kind === 'extra-envelope') Object.assign(row, { extra: true });
    else if (kind === 'revision') row.revision++;
    else if (kind === 'schema') Object.assign(chunk, { schema: 2 });
    else if (kind === 'sequence') chunk.sequence++;
    else if (kind === 'offset') chunk.offset++;
    else if (kind === 'count') chunk.cells.pop();
    else if (kind === 'extra-field') Object.assign(chunk, { extra: true });
    else if (kind === 'foreign-floor') chunk.cells[0].at.level++;
    else if (kind === 'same-id-data') chunk.cells[1].chests[0].opened = true;
    else chunk.cells[0].edges.east = f.cells[17].at;
    await expect(selectiveSourceReader(f.pages)({ sequence: 1, id: f.parent.id, index: 16 })).rejects.toThrow();
    expect(f.reads).toEqual([f.key, f.proof.key, `${f.key}/1`]); expect(f.writes).toEqual([]);
  });

  it.each(['missing', 'same-id-data', 'same-id-edge'] as const)('defers unselected %s corruption to full audit', async kind => {
    const f = await observationFixture(), row = f.records.get(`${f.key}/1`)!, chunk = row.value as unknown as ObservationChunk;
    if (kind === 'missing') f.records.delete(row.key);
    if (kind === 'same-id-data') chunk.cells[0].chests[0].opened = true;
    if (kind === 'same-id-edge') chunk.cells[0].edges.east = f.cells[17].at;
    expect(await selectiveSourceReader(f.pages)({ sequence: 1, id: f.parent.id, index: 32 })).toEqual(f.cells[32]);
    expect(f.reads).toEqual([f.key, f.proof.key, `${f.key}/2`]);
    await expect(full(f)).rejects.toThrow();
  });

  it.each(['actor', 'count', 'owner', 'epoch', 'observedAt', 'chunks'] as const)('detects valid-shaped header %s changes', async kind => {
    const f = await observationFixture(), header = f.records.get(f.key)!.value as unknown as ObservationHeader;
    if (kind === 'actor') header.actor = f.cells[1].at;
    if (kind === 'count') header.count++;
    if (kind === 'owner') header.owner = 'other';
    if (kind === 'epoch') header.epoch++;
    if (kind === 'observedAt') header.observedAt = '2026-10-23T00:00:00.000Z';
    if (kind === 'chunks') header.chunks.reverse();
    await expect(selectiveSourceReader(f.pages)({ sequence: 1, id: f.parent.id, index: 0 })).rejects.toThrow();
    expect(f.reads).toEqual([f.key, f.proof.key]);
  });

  it('does not trust a previous reader or let a returned cell poison its private cache', async () => {
    const f = await observationFixture(), source = { sequence: 1, id: f.parent.id, index: 0 }, read = selectiveSourceReader(f.pages);
    const seen = await read(source); seen.chests[0].opened = true;
    expect(await read(source)).toEqual(f.cells[0]);
    (f.records.get(`${f.key}/0`)!.value as unknown as ObservationChunk).cells[0].chests[0].opened = true;
    await expect(selectiveSourceReader(f.pages)(source)).rejects.toThrow('integrity');
  });

  it('captures caller references before the first read suspends', async () => {
    const f = await observationFixture(), get = f.pages.get.bind(f.pages);
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    f.pages.get = async (...args) => { await gate; return get(...args); };
    const source = { sequence: 1, id: f.parent.id, index: 0 }, pending = selectiveSourceReader(f.pages)(source);
    source.id = 'changed'; source.sequence = 2; source.index = 32; release();
    expect(await pending).toEqual(f.cells[0]);
  });

  it('captures writer records before checking whether a proof already exists', async () => {
    const f = await observationFixture(); f.records.delete(f.proof.key);
    const get = f.pages.get.bind(f.pages);
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    f.pages.get = async (...args) => { await gate; return get(...args); };
    const pending = retainObservationIntegrity(f.pages, f.parent, f.chunks);
    f.parent.id = 'changed'; (f.chunks[0].value as unknown as ObservationChunk).cells[0].chests[0].opened = true; release();
    expect((await pending).value).toEqual(f.proof.value);
  });
});
