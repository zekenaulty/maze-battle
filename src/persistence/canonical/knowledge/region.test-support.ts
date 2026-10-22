import type { CanonicalPages } from '../pages';
import type { CanonicalRecord } from '../types';
import type { GameCheckpoint } from '../game/checkpoint';
import { observationKey } from './keys';
import { rememberObservation } from './memory';
import { indexObservedWorldCells } from './worldIndex';
import { observationChunksDigest, observationDigest, retainObservationIntegrity } from './observation.integrity';
import { OBSERVATION_CHUNK_SIZE, type ObservationHeader, type ObservedCell } from './types';

export const earnedCell = (row = -5, column = -2, spaceId = 'room', localRow = 0, localColumn = 0): ObservedCell => ({
  at: { level: 1, cell: { spaceId, row: localRow, column: localColumn } }, world: { row, column },
  edges: { north: null, east: null, south: null, west: null }, chests: [{ id: 'chest', opened: false }], stairs: [],
});
export function knowledgeFixture(initial?: { records: Map<string, CanonicalRecord>; checkpoint: GameCheckpoint }) {
  const records = structuredClone(initial?.records ?? new Map<string, CanonicalRecord>()), reads: string[] = [], writes: string[] = [];
  let witness = initial?.checkpoint.knowledge?.witness ?? null;
  let checkpoint: GameCheckpoint = structuredClone(initial?.checkpoint ?? { schema: 1, kind: 'rpg', position: earnedCell().at,
    knowledge: null, mode: 'manual', facing: 'south', wave: 1, createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T00:00:00.000Z', activityLog: [] });
  let revision = checkpoint.knowledge?.sequence ?? 0;
  const guard = (area: string) => { if (area !== 'knowledge') throw Error('Hidden geometry read'); };
  const pages = {
    get: async (area: string, key: string) => { guard(area); reads.push(key); return structuredClone(records.get(key)); },
    set: async (area: string, key: string, value: unknown, indexes: string[] = []) => {
      guard(area); writes.push(key);
      const row = { generation: 'generation', gameId: 'game', area: 'knowledge', key, indexes: [...indexes],
        id: crypto.randomUUID(), value: structuredClone(value), revision } as CanonicalRecord;
      records.set(key, row); witness = crypto.randomUUID(); return structuredClone(row);
    },
    witness: async (area: string) => { guard(area); return witness; },
    scan: async () => { throw Error('Region must not scan'); },
  } as unknown as CanonicalPages;
  return { pages, records, reads, writes, checkpoint: () => structuredClone(checkpoint),
    snapshot: () => knowledgeFixture({ records, checkpoint }),
    async observe(cells: ObservedCell[], metadata: Partial<Pick<ObservationHeader, 'spaces' | 'graph' | 'actor'>> = {}) {
      cells = structuredClone(cells); metadata = structuredClone(metadata);
      revision++; const sequence = revision, key = observationKey(sequence), chunks: CanonicalRecord[] = [];
      for (let i = 0; i < cells.length; i += OBSERVATION_CHUNK_SIZE) {
        const row = await pages.set('knowledge', `${key}/${chunks.length}`,
          { schema: 1, sequence, offset: i, cells: structuredClone(cells.slice(i, i + OBSERVATION_CHUNK_SIZE)) } as never);
        chunks.push(row);
      }
      const header: ObservationHeader = { schema: 1, sequence, previous: checkpoint.knowledge
        ? { sequence: checkpoint.knowledge.sequence, id: checkpoint.knowledge.id } : null,
        owner: 'owner', epoch: 1, revision, observedAt: checkpoint.updatedAt, actor: cells[0].at,
        policy: 'linked-vision-v1', radius: 7, count: cells.length, chunks: chunks.map(row => row.id),
        chunksDigest: observationChunksDigest(chunks.map(observationDigest)), ...metadata };
      const row = await pages.set('knowledge', key, header as never);
      await retainObservationIntegrity(pages, row, chunks);
      await rememberObservation(pages, cells, { sequence, id: row.id });
      await indexObservedWorldCells(pages, cells);
      checkpoint = { ...checkpoint, position: structuredClone(header.actor), knowledge: { sequence, id: row.id, witness: witness! } };
      return { header, cells: structuredClone(cells) };
    },
  };
}
