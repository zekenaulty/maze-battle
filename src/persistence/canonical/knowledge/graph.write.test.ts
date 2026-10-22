// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { CanonicalPages } from '../pages';
import { workBudget } from '../budget';
import { accountHead, appendedBytes } from '../accounting';
import { protocolHead } from '../agentica/types.test-support';
import { checkpointJson, gameCheckpoint } from '../game/checkpoint';
import type { CanonicalWork } from '../transaction';
import type { CanonicalHead, CanonicalIndexNode, CanonicalRead, CanonicalRecord, CanonicalWrite } from '../types';
import { recordGameObservation } from './write';
import { observePositionEvidence } from './observe';
import { listKnownLinks, listKnownNodes, KnownGraphUnavailableError } from './graph';
import { connected, earnedCell } from './graph.test-support';
import { GRAPH_KEY } from './graph.records';
import { loadObservation } from './evidence';
import { observationKey } from './keys';
import { rememberObservation } from './memory';
import { indexObservedWorldCells } from './worldIndex';
import { json } from '../world/records';
import type { ObservedCell, ObservedSpace } from './types';

vi.mock('./observe', () => ({ observePositionEvidence: vi.fn() }));
afterEach(() => vi.clearAllMocks());

function harness() {
  let head = protocolHead(), initialized = false;
  const records = new Map<string, CanonicalRecord>(), nodes = new Map<string, CanonicalIndexNode>();
  function pages(mode: 'readonly' | 'readwrite', captured: CanonicalHead, budget = workBudget()) {
    const tx = { mode, objectStore: (name: string) => ({ get: async (key: string[]) => structuredClone(
      name === 'records' ? records.get(key[1]) : nodes.get(key[1])) }) } as unknown as CanonicalWrite | CanonicalRead;
    return { pages: new CanonicalPages(tx, captured, budget), budget };
  }
  return { snapshot: () => structuredClone(head), records, nodes,
    fillQuota() {
      head.allocations.obligation = { revision: head.revision, bytes: 147456 };
      head.quota.reservedBytes = 147456; head.quota.reservations = 1;
      head.quota.limitBytes = head.quota.usedBytes + head.quota.reserveBytes + head.quota.reservedBytes;
    },
    async observe(cells: ObservedCell[], spaces: ObservedSpace[], legacy = false) {
      vi.mocked(observePositionEvidence).mockResolvedValue(structuredClone({ cells, spaces }));
      const view = pages('readwrite', head), checkpoint = gameCheckpoint(head.checkpoint); checkpoint.position = structuredClone(cells[0].at);
      let next;
      if (legacy) {
        expect(checkpoint.knowledge).toBeNull(); expect(cells.length).toBeLessThanOrEqual(16);
        const key = observationKey(1), chunk = await view.pages.set('knowledge', `${key}/0`, json({ schema: 1, sequence: 1, offset: 0, cells }));
        const row = await view.pages.set('knowledge', key, json({ schema: 1, sequence: 1, previous: null, owner: head.owner,
          epoch: head.epoch, revision: head.revision + 1, observedAt: checkpoint.updatedAt, actor: checkpoint.position,
          policy: 'linked-vision-v1', radius: 7, count: cells.length, chunks: [chunk.id] }));
        await rememberObservation(view.pages, cells, { sequence: 1, id: row.id }); await indexObservedWorldCells(view.pages, cells);
        next = { ...checkpoint, knowledge: { sequence: 1, id: row.id, witness: (await view.pages.witness('knowledge', 'perception/'))! } };
      } else next = await recordGameObservation({ pages: view.pages, head } as CanonicalWork, checkpoint);
      const ready = await view.pages.prepare(), candidate = { ...head, revision: head.revision + 1, roots: ready.roots, checkpoint: checkpointJson(next) };
      const accounted = accountHead(initialized ? head : undefined, candidate, appendedBytes(ready.records, ready.nodes));
      for (const row of ready.records) records.set(row.id, row);
      for (const row of ready.nodes) nodes.set(row.node.id, row);
      head = accounted; initialized = true; return view.budget.snapshot();
    },
    async read<T>(work: (p: CanonicalPages, h: CanonicalHead) => Promise<T>, captured = head) {
      const view = pages('readonly', captured), value = await work(view.pages, structuredClone(captured));
      view.pages.finishRead(); return { value, stats: view.budget.snapshot() };
    },
  };
}

it('commits observation classification, both adjacency sides and marker under the exact checkpoint witness', async () => {
  const h = harness(), pair = connected(); const cost = await h.observe(pair.cells, pair.spaces);
  const result = await h.read(async (p, head) => {
    const checkpoint = gameCheckpoint(head.checkpoint), source = checkpoint.knowledge!;
    const observation = await loadObservation(p, { sequence: source.sequence, id: source.id });
    expect(observation.header).toMatchObject({ graph: 'available', spaces: pair.spaces });
    expect(await p.witness('knowledge', 'perception/')).toBe(source.witness);
    expect(await p.get('knowledge', GRAPH_KEY)).toBeDefined();
    return listKnownNodes(p, checkpoint, { level: 1, kind: 'all' });
  });
  expect(result.value.items.map(n => n.kind)).toEqual(['room', 'passage']); expect(result.stats.writes).toBe(0);
  console.info(JSON.stringify({ graphCanonicalPages: { write: cost, read: result.stats } }));
});

it('re-reads exact prior graph from retained immutable roots after current topology changes', async () => {
  const h = harness(), pair = connected(); await h.observe(pair.cells, pair.spaces);
  const original = h.snapshot(), query = (p: CanonicalPages, head: CanonicalHead) =>
    listKnownLinks(p, gameCheckpoint(head.checkpoint), { level: 1, spaceId: pair.spaces[0].spaceId });
  const first = await h.read(query, original), closed = structuredClone(pair.cells[0]); closed.edges.east = null;
  await h.observe([closed], [pair.spaces[0]]);
  const away = earnedCell(30, 30, 'away'); await h.observe([away], [{ spaceId: 'away', kind: 'room', index: 0 }]);
  expect((await h.read(query)).value.items).toEqual([]);
  const replay = await h.read(query, original); expect(replay.value).toEqual(first.value); expect(replay.stats.writes).toBe(0);
  // This qualifies retained-root reads, not public action-result replay/admission.
});

it('quota refusal after graph staging preserves prior roots, records and funded allocations', async () => {
  const h = harness(), pair = connected(); await h.observe(pair.cells, pair.spaces); h.fillQuota();
  const before = h.snapshot(), records = structuredClone(h.records), nodes = structuredClone(h.nodes);
  const closed = structuredClone(pair.cells[0]); closed.edges.east = null;
  await expect(h.observe([closed], [pair.spaces[0]])).rejects.toThrow('storage quota');
  expect(h.snapshot()).toEqual(before); expect(h.records).toEqual(records); expect(h.nodes).toEqual(nodes);
  expect(h.snapshot().allocations.obligation.bytes).toBe(147456);
});

it('refuses new observations on unmarked history without writes, backfill or funded custody loss', async () => {
  const h = harness(), pair = connected(); await h.observe(pair.cells, pair.spaces, true);
  h.fillQuota();
  const before = h.snapshot(), records = structuredClone(h.records), nodes = structuredClone(h.nodes);
  await expect(h.observe(pair.cells, pair.spaces)).rejects.toThrow('requires an available earned graph projection');
  expect(h.snapshot()).toEqual(before); expect(h.records).toEqual(records); expect(h.nodes).toEqual(nodes);
  expect(h.snapshot().allocations.obligation.bytes).toBe(147456);
  await h.read(async (p, head) => {
    const checkpoint = gameCheckpoint(head.checkpoint);
    expect(await p.get('knowledge', GRAPH_KEY)).toBeUndefined();
    await expect(listKnownNodes(p, checkpoint, { level: 1, kind: 'room' })).rejects.toBeInstanceOf(KnownGraphUnavailableError);
  });
});
