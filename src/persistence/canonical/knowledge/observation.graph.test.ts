// @vitest-environment node
import { expect, it } from 'vitest';
import { connected, graphFixture } from './graph.test-support';
import { loadObservation, sourceReader } from './evidence';
import { observationKey } from './keys';
import type { ObservationHeader } from './types';

it('binds finalized visible classification in both production full and selected source readers', async () => {
  const f = graphFixture(), pair = connected(), original = await f.observe(pair.cells, pair.spaces);
  expect((await loadObservation(f.pages, original.reference)).header.spaces).toEqual(pair.spaces);
  expect(await sourceReader(f.pages)({ ...original.reference, index: 1 })).toEqual(pair.cells[1]);
});

it.each(['kind', 'space', 'index', 'omitted-classification', 'chunks-commitment'] as const)
('refuses same-ID graph/header %s mutation before returning any selected cell', async kind => {
  const f = graphFixture(), pair = connected(), original = await f.observe(pair.cells, pair.spaces);
  const header = f.records.get(observationKey(original.reference.sequence))!.value as unknown as ObservationHeader;
  if (kind === 'kind') header.spaces![0].kind = 'passage';
  if (kind === 'space') header.spaces![0].spaceId = 'other';
  if (kind === 'index') header.spaces![0].index = 1;
  if (kind === 'omitted-classification') { delete header.spaces; delete header.graph; }
  if (kind === 'chunks-commitment') header.chunksDigest = `sha256:${'0'.repeat(64)}`;
  f.writes.length = 0;
  await expect(sourceReader(f.pages)({ ...original.reference, index: 1 })).rejects.toThrow('integrity');
  await expect(loadObservation(f.pages, original.reference)).rejects.toThrow('integrity');
  expect(f.writes).toEqual([]);
});
