import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDirectedFixture } from '../../domain/directed/fixture';
import { emptyDirectedKnowledge, rememberDirected } from '../../domain/directed/knowledge';
import { presentObservationSources } from '../../domain/directed/sourceContext';
import type { ObservationReceipt } from '../../domain/directed/types';
import type { DirectedTransaction, SaveRecord } from './database';
import { readDirectedObservationSources, readObservationSourcesAt } from './observationSources';
import { canonical } from './values';

const database = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock('./database', async importOriginal => ({
  ...await importOriginal<typeof import('./database')>(), transaction: database.transaction,
  slotRange: (slot: string) => ({ slot }),
}));
afterEach(() => database.transaction.mockReset());

type Key = string | (string | number)[];
type Row = { key: Key; value: unknown };
// Only the storage transport is mocked; load, schema, identity and witness checks are real.
function archive(mode: 'checkpoint-v1' | undefined = 'checkpoint-v1') {
  const { session, observations, events } = createDirectedFixture();
  const slot = 'source-proof';
  const record: SaveRecord = { session, ...(mode ? { historyMode: mode } : {}),
    counts: { observations: observations.length, projections: observations.length + 1, events: events.length, contexts: 0, receipts: 0 } };
  const stores: Record<string, Row[]> = {
    saves: [{ key: slot, value: record }], worlds: [{ key: slot, value: session.world }],
    observations: observations.map(source => ({ key: [slot, source.sequence], value: source })),
    events: events.map(event => ({ key: [slot, event.revision], value: event })),
    projections: [], contexts: [], receipts: [], witnesses: [], identities: [], controlReserve: [],
  };
  const set = (store: string, key: Key, value: unknown) => {
    const rows = stores[store];
    const index = rows.findIndex(row => JSON.stringify(row.key) === JSON.stringify(key));
    if (index < 0) rows.push({ key, value }); else rows[index] = { key, value };
  };
  const remove = (store: string, key: Key) => {
    stores[store] = stores[store].filter(row => JSON.stringify(row.key) !== JSON.stringify(key));
  };
  let knowledge = emptyDirectedKnowledge(session.world.id, session.actor.id);
  set('projections', [slot, 0], knowledge);
  for (const source of observations) {
    knowledge = rememberDirected(knowledge, source);
    set('projections', [slot, knowledge.revision], knowledge);
  }
  if (mode) {
    set('witnesses', [slot, 'head', 'current'], canonical(record));
    for (const name of ['observations', 'events', 'projections']) for (const row of stores[name]) {
      set('witnesses', [slot, name, row.key[1]], canonical(row.value));
    }
    for (const source of observations) {
      set('identities', [slot, 'observations', source.id], source.sequence);
      set('witnesses', [slot, 'identity:observations', source.id], canonical(source.sequence));
    }
  }
  const reads: { store: string; method: string; query?: unknown; limit?: number }[] = [];
  const tx = {
    objectStore(name: string) {
      const selected = (query?: unknown) => stores[name].filter(row => query === undefined
        || (typeof query === 'object' && query !== null && !Array.isArray(query)
          ? Array.isArray(row.key) && row.key[0] === (query as { slot: string }).slot
          : JSON.stringify(row.key) === JSON.stringify(query)));
      return {
        get: async (query: unknown) => {
          reads.push({ store: name, method: 'get', query });
          return structuredClone(selected(query)[0]?.value);
        },
        getAll: async (query?: unknown, limit?: number) => {
          reads.push({ store: name, method: 'getAll', query, limit });
          return structuredClone(selected(query).slice(0, limit).map(row => row.value));
        },
        getAllKeys: async (query?: unknown, limit?: number) => {
          reads.push({ store: name, method: 'getAllKeys', query, limit });
          return structuredClone(selected(query).slice(0, limit).map(row => row.key));
        },
        count: async (query?: unknown) => selected(query).length,
        openCursor: async (query?: unknown) => {
          const rows = selected(query);
          const cursor = (index: number): unknown => index >= rows.length ? null : {
            key: structuredClone(rows[index].key), value: structuredClone(rows[index].value), continue: async () => cursor(index + 1),
          };
          return cursor(0);
        },
      };
    },
  } as unknown as DirectedTransaction;
  database.transaction.mockImplementation(async (work: (tx: DirectedTransaction) => Promise<unknown>) => structuredClone(await work(tx)));
  return { slot, tx, record, stores, observations, reads, set, remove };
}

describe('actor observation source repository reads', () => {
  it('uses only bounded checkpoint point reads with validated originals in requested order', async () => {
    const value = archive();
    const ids = value.observations.slice(0, 8).map(source => source.id).reverse();
    const before = structuredClone(value.stores);
    const sources = await readObservationSourcesAt(value.tx, value.slot, value.record, ids);
    expect(sources.map(source => source.id)).toEqual(ids);
    expect(sources[0]).toEqual(value.observations[7]);
    expect(sources[0]).toHaveProperty('sourceWorldRevision');
    expect(value.reads).toHaveLength(32);
    expect(value.reads.every(read => read.method === 'get')).toBe(true);
    expect(new Set(value.reads.map(read => read.store))).toEqual(new Set(['observations', 'identities', 'witnesses']));
    expect(value.stores).toEqual(before);
  });

  it('loads and validates the checkpoint before returning only public actor sources', async () => {
    const value = archive();
    const ids = [value.observations[0].id, 'missing-source'];
    const before = structuredClone(value.stores);
    const result = await readDirectedObservationSources(value.slot, ids);
    expect(result).toEqual(presentObservationSources({ worldId: 'W1', floorId: 'F1', observerId: 'P1' },
      value.record.session.knowledge.revision, ids, [value.observations[0]]));
    expect(result.json).not.toContain('sourceWorldRevision');
    expect(JSON.parse(result.json).missingIds).toEqual(['missing-source']);
    expect(value.reads.filter(read => read.method === 'getAll')).toEqual([
      { store: 'saves', method: 'getAll', query: value.slot, limit: 1 },
    ]);
    expect(value.stores).toEqual(before);
  });

  it('returns no invented sources for unknown IDs and performs no source reads for an empty request', async () => {
    const value = archive();
    expect(await readObservationSourcesAt(value.tx, value.slot, value.record, [])).toEqual([]);
    expect(value.reads).toEqual([]);
    expect(await readObservationSourcesAt(value.tx, value.slot, value.record, ['missing'])).toEqual([]);
    expect(value.reads.map(read => read.store)).toEqual(['identities', 'witnesses']);
  });

  it('snapshots requested IDs before awaiting storage', async () => {
    const value = archive();
    const ids = [value.observations[0].id];
    const pending = readDirectedObservationSources(value.slot, ids);
    ids[0] = 'changed-after-call';
    expect((await pending).observationIds).toEqual([value.observations[0].id]);
  });

  it('regenerates historical missing-ID bytes even when those IDs now exist', async () => {
    const value = archive();
    const ids = [value.observations[0].id, value.observations.at(-1)!.id];
    const identity = { worldId: 'W1', floorId: 'F1', observerId: 'P1' };
    const original = presentObservationSources(identity, 1, ids, [value.observations[0]]);
    const sources = await readObservationSourcesAt(value.tx, value.slot, value.record, ids);
    expect(presentObservationSources(identity, 1, ids, sources)).toEqual(original);
  });

  it.each(['worldId', 'observerId'] as const)('rejects a stored source with mismatched %s', async field => {
    const value = archive();
    const source = value.observations[0];
    source[field] = 'other';
    await expect(readObservationSourcesAt(value.tx, value.slot, value.record, [source.id])).rejects.toThrow('scope mismatch');
  });

  it('rejects a caller record with contradictory actor knowledge identities before source I/O', async () => {
    const value = archive();
    value.record.session.knowledge.observerId = 'other';
    await expect(readObservationSourcesAt(value.tx, value.slot, value.record, [value.observations[0].id])).rejects.toThrow('scope mismatch');
    expect(value.reads).toEqual([]);
  });

  it.each(['deleted-source', 'modified-source', 'missing-source-witness', 'missing-index', 'missing-index-witness'] as const)
    ('fails closed on %s rather than describing corruption as missing knowledge', async failure => {
      const value = archive();
      const source = value.observations[0];
      if (failure === 'deleted-source') value.remove('observations', [value.slot, source.sequence]);
      if (failure === 'modified-source') source.scene.spaces[0].name = 'Tampered room';
      if (failure === 'missing-source-witness') value.remove('witnesses', [value.slot, 'observations', source.sequence]);
      if (failure === 'missing-index') value.remove('identities', [value.slot, 'observations', source.id]);
      if (failure === 'missing-index-witness') value.remove('witnesses', [value.slot, 'identity:observations', source.id]);
      await expect(readObservationSourcesAt(value.tx, value.slot, value.record, [source.id])).rejects.toThrow();
    });

  it.each([0, -1, 1.5, '1', 18])('rejects malformed or future identity sequence %s', async sequence => {
    const value = archive();
    const source = value.observations[0];
    value.set('identities', [value.slot, 'observations', source.id], sequence);
    value.set('witnesses', [value.slot, 'identity:observations', source.id], canonical(sequence));
    await expect(readObservationSourcesAt(value.tx, value.slot, value.record, [source.id])).rejects.toThrow();
  });

  it('rejects an identity alias even with a matching identity witness', async () => {
    const value = archive();
    value.set('identities', [value.slot, 'observations', 'alias'], 1);
    value.set('witnesses', [value.slot, 'identity:observations', 'alias'], canonical(1));
    await expect(readObservationSourcesAt(value.tx, value.slot, value.record, ['alias'])).rejects.toThrow('identity mismatch');
  });

  it('rejects corrupt save checkpoints rather than returning sources from an unvalidated head', async () => {
    const value = archive();
    value.remove('witnesses', [value.slot, 'head', 'current']);
    await expect(readDirectedObservationSources(value.slot, [value.observations[0].id])).rejects.toThrow('witness mismatch');
  });

  it('validates ID bounds before opening storage or traversing any sources', async () => {
    const value = archive();
    const ids = Array.from({ length: 9 }, (_, index) => `source-${index}`);
    await expect(readDirectedObservationSources(value.slot, ids)).rejects.toThrow('ID limit');
    await expect(readObservationSourcesAt(value.tx, value.slot, value.record, ids)).rejects.toThrow('ID limit');
    await expect(readDirectedObservationSources(value.slot, ['a', 'a'])).rejects.toThrow('duplicate');
    expect(database.transaction).not.toHaveBeenCalled();
    expect(value.reads).toEqual([]);
  });

  it('uses a bounded legacy source scan and validates its original keys and identities', async () => {
    const value = archive();
    delete value.record.historyMode;
    const sources = await readObservationSourcesAt(value.tx, value.slot, value.record, [value.observations[2].id, 'missing']);
    expect(sources).toEqual([value.observations[2]]);
    expect(value.reads).toEqual([
      { store: 'observations', method: 'getAll', query: { slot: value.slot }, limit: 4097 },
      { store: 'observations', method: 'getAllKeys', query: { slot: value.slot }, limit: 4097 },
    ]);
  });

  it('passes the legacy full load/audit path without upgrading or writing the save', async () => {
    const value = archive();
    delete value.record.historyMode;
    const before = structuredClone(value.stores);
    const result = await readDirectedObservationSources(value.slot, [value.observations[2].id]);
    expect(result.observationIds).toEqual([value.observations[2].id]);
    expect(value.stores).toEqual(before);
  });

  it.each(['wrong-key', 'duplicate-id', 'wrong-observer', 'missing-row'] as const)('rejects legacy %s', async failure => {
    const value = archive();
    delete value.record.historyMode;
    if (failure === 'wrong-key') value.stores.observations[0].key = [value.slot, 99];
    if (failure === 'duplicate-id') value.observations[1].id = value.observations[0].id;
    if (failure === 'wrong-observer') value.observations[0].observerId = 'other';
    if (failure === 'missing-row') value.stores.observations.pop();
    await expect(readObservationSourcesAt(value.tx, value.slot, value.record, [value.observations[0].id])).rejects.toThrow();
  });

  it('cannot leak a source from another slot', async () => {
    const value = archive();
    const source = value.observations[0];
    value.set('identities', ['other-slot', 'observations', 'private-id'], source.sequence);
    value.set('witnesses', ['other-slot', 'identity:observations', 'private-id'], canonical(source.sequence));
    value.set('observations', ['other-slot', source.sequence], { ...source, id: 'private-id' } satisfies ObservationReceipt);
    expect(await readObservationSourcesAt(value.tx, value.slot, value.record, ['private-id'])).toEqual([]);
  });
});
