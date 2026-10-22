import type { CanonicalPages } from '../pages';
import type { CanonicalRecord, Json } from '../types';
import { json } from '../world/records';
import { earnedCell } from './region.test-support';
import { observationKey } from './keys';
import { observationChunksDigest, observationDigest, retainObservationIntegrity } from './observation.integrity';
import type { ObservationHeader, ObservedCell } from './types';

export async function observationFixture(count = 33, sequence = 1) {
  const records = new Map<string, CanonicalRecord>(), reads: string[] = [], writes: string[] = [];
  const row = (key: string, value: Json): CanonicalRecord => ({ generation: 'generation', gameId: 'game',
    area: 'knowledge', key, id: crypto.randomUUID(), revision: sequence + 6, indexes: [], value: structuredClone(value) });
  const pages = {
    async get(area: string, key: string) { if (area !== 'knowledge') throw Error('Hidden read'); reads.push(key); return structuredClone(records.get(key)); },
    async set(area: string, key: string, value: Json) {
      if (area !== 'knowledge') throw Error('Hidden write'); writes.push(key);
      const record = row(key, value); records.set(key, record); return structuredClone(record);
    },
    async scan() { throw Error('Unexpected scan'); }, async witness() { return 'witness'; },
  } as unknown as CanonicalPages;
  const cells: ObservedCell[] = Array.from({ length: count }, (_, i) => ({ ...earnedCell(0, i, 'room', 0, i), edges: {} }));
  const key = observationKey(sequence), chunks: CanonicalRecord[] = [];
  for (let i = 0; i < count; i += 16) chunks.push(await pages.set('knowledge', `${key}/${chunks.length}`,
    json({ schema: 1, sequence, offset: i, cells: cells.slice(i, i + 16) })));
  const header: ObservationHeader = { schema: 1, sequence, previous: sequence === 1 ? null : { sequence: sequence - 1, id: 'previous' },
    owner: 'owner', epoch: 1, revision: sequence + 6,
    observedAt: '2026-10-22T00:00:00.000Z', actor: cells[0].at, policy: 'linked-vision-v1', radius: 7, count, chunks: chunks.map(c => c.id),
    chunksDigest: observationChunksDigest(chunks.map(observationDigest)) };
  const parent = await pages.set('knowledge', key, json(header));
  const proof = await retainObservationIntegrity(pages, parent, chunks);
  reads.length = writes.length = 0;
  return { pages, records, reads, writes, cells, chunks, parent, proof, header, key };
}
