import { afterEach, describe, expect, it, vi } from 'vitest';
import { directions, sourceOf } from '../../domain/agentic/knowledge/shared';
import type { RpgAddress, RpgObservation } from '../../domain/agentic/knowledge/types';
import { movePosition } from '../../domain/maze/movement';
import { ancestorIndex, observationLineage, observationReader } from '../observationNodes';
import type { RpgObservationNode } from '../observationTypes';
import { memoryBudget } from './budget';
import { deriveRpgMemory } from './derive';
import { rpgFrontiers } from './frontiers';
import { cellMemoryKey } from './keys';
import type { MemoryQuery } from './query';
import { MemoryTree, type MemoryNode } from './tree';
import type { MemoryValue, MemoryWork } from './types';
import { memoryWitnesses } from './witnesses';

afterEach(() => vi.restoreAllMocks());
const address = (row = 20, column = 20, floor = 1): RpgAddress => ({ floor, row, column });
const invalid = 'Invalid or unavailable RPG memory. Source evidence was preserved.';

// Public receipts only: no game, generator, seed, or hidden topology is an input.
function receipt(radius = 0, revision = 1, actor = address()): RpgObservation {
  const cells: RpgObservation['cells'][number][] = [];
  for (let row = -radius; row <= radius; row++) {
    for (let column = -radius; column <= radius; column++) {
      if (Math.abs(row) + Math.abs(column) > radius) continue;
      const position = address(actor.row + row, actor.column + column, actor.floor);
      cells.push({ address: position, roomIds: [], chests: [], stairs: [], blocked: [],
        links: directions.filter(direction => {
          const next = movePosition(position, direction);
          return Math.abs(next.row - actor.row) + Math.abs(next.column - actor.column) <= radius;
        }) });
    }
  }
  return { status: 'observed', version: 1, id: `receipt-${revision}`, gameId: 'frontier-game',
    revision: { owner: 'owner', epoch: 1, revision }, observedAt: '2026-10-12T00:00:00.000Z',
    actor, policy: { kind: 'rpg-linked-bfs-v1', radius }, cells };
}

// Storage transport alone is in-memory; tree validation, derivation and ancestry proofs are real.
async function archive(receipts = [receipt()]) {
  const nodes = new Map<string, MemoryNode>(), sources = new Map<string, RpgObservationNode>();
  const store = { async get(id: string) { return structuredClone(nodes.get(id)); },
    async add(node: MemoryNode) { nodes.set(node.id, structuredClone(node)); } };
  const reader = observationReader({ async get(id) { return sources.get(id); } }, receipts[0].gameId);
  const writer = new MemoryTree(store, null, memoryBudget({ maxReads: 65536, maxWrites: 65536 }));
  const snapshots: { head: RpgObservationNode; root: string | null }[] = [];
  let count = 0;
  for (const observation of receipts) {
    const metadata = { id: observation.id, gameId: observation.gameId, depth: snapshots.length + 1,
      ancestors: await ancestorIndex(reader, snapshots.at(-1)?.head) };
    sources.set(observation.id, { ...metadata, version: 1, observation, lineage: observationLineage(metadata) });
    const head = await reader.read(observation.id);
    count = await deriveRpgMemory(writer, reader, head, count);
    snapshots.push({ head, root: await writer.flush() });
  }
  const open = (index = snapshots.length - 1, work: MemoryWork = {}) => {
    const { head, root } = snapshots[index], budget = memoryBudget(work), reads: string[] = [];
    const reader = observationReader({ async get(id) {
      budget.read(); reads.push(`source:${id}`); return structuredClone(sources.get(id));
    } }, head.gameId);
    const tree = new MemoryTree({ async get(id) { reads.push(`node:${id}`); return store.get(id); },
      async add() { throw new Error('Unexpected write'); } }, root, budget);
    vi.spyOn(tree, 'scan').mockRejectedValue(new Error('Unexpected scan'));
    const get = vi.spyOn(tree, 'get'), cell = vi.fn(memoryWitnesses(reader, head));
    return { query: { tree, head, cell } satisfies MemoryQuery, get, cell, budget, reads };
  };
  return { open, nodes, sources };
}

describe('current earned frontiers', () => {
  it('returns only public anchors and current sources in cardinal order, without writes', async () => {
    const observation = receipt(), f = await archive([observation]), memory = f.open(), before = structuredClone([...f.nodes]);
    const page = await rpgFrontiers(memory.query, { limit: 12 });
    expect(page).toEqual({ kind: 'frontiers', status: 'ready', floor: 1, snapshotId: observation.id, truncated: false,
      frontiers: directions.map(direction => ({ anchor: address(), direction, source: sourceOf(observation) })) });
    expect(Object.isFrozen(page.frontiers[0].source.revision)).toBe(true);
    expect(Object.isFrozen(page.frontiers[0].anchor)).toBe(true);
    expect(memory.get).toHaveBeenCalledTimes(4);
    expect(memory.cell).toHaveBeenCalledTimes(4);
    expect(memory.budget.stats().writes).toBe(0);
    expect([...f.nodes]).toEqual(before);
  });

  it('excludes old remembered neighbors outside the current view but not cells on another floor', async () => {
    const latest = receipt(0, 3), f = await archive([receipt(0, 1, address(19)), receipt(0, 2, address(20, 21, 2)), latest]);
    const memory = f.open(), page = await rpgFrontiers(memory.query, { limit: 12 });
    expect(page.frontiers.map(frontier => frontier.direction)).toEqual(['east', 'south', 'west']);
    expect(page.frontiers.every(frontier => frontier.source.id === latest.id)).toBe(true);
    expect(memory.reads).toContain('source:receipt-1');
    expect(memory.get.mock.calls.map(([key]) => key)).toEqual(directions.map(direction =>
      cellMemoryKey({ floor: 1, ...movePosition(address(), direction) })));
  });

  it('skips open and blocked receipt edges before reading, caching shared unknown neighbors', async () => {
    const original = receipt(1), observation = { ...original, cells: original.cells.map((cell, index) =>
      index ? cell : { ...cell, blocked: ['north' as const] }) };
    const memory = (await archive([observation])).open(), page = await rpgFrontiers(memory.query, { limit: 12 });
    expect(page.frontiers).toHaveLength(11);
    expect(page.truncated).toBe(false);
    expect(memory.get).toHaveBeenCalledTimes(7);
    expect(memory.cell).toHaveBeenCalledTimes(7);
    for (const frontier of page.frontiers) {
      const cell = observation.cells.find(cell => cellMemoryKey(cell.address) === cellMemoryKey(frontier.anchor))!;
      expect([...cell.links, ...cell.blocked]).not.toContain(frontier.direction);
    }
    expect(memory.get.mock.calls.flat()).not.toContain(cellMemoryKey(address(18)));
    for (const cell of observation.cells) expect(memory.get.mock.calls.flat()).not.toContain(cellMemoryKey(cell.address));
  });

  it('caches shared known neighbors and emits an empty page when none are unknown', async () => {
    const latest = receipt(1, 9), boundary = new Map<string, RpgAddress>();
    for (const cell of latest.cells) for (const direction of directions) {
      if (cell.links.includes(direction)) continue;
      const next = { floor: 1, ...movePosition(cell.address, direction) };
      boundary.set(cellMemoryKey(next), next);
    }
    const memory = (await archive([...boundary.values()].map((at, i) => receipt(0, i + 1, at)).concat(latest))).open();
    expect(await rpgFrontiers(memory.query, { limit: 12 })).toMatchObject({ frontiers: [], truncated: false });
    expect(memory.get).toHaveBeenCalledTimes(8);
    expect(memory.cell).toHaveBeenCalledTimes(8);
  });

  it('uses only current anchors and receipt edges, not stale remembered edge sources', async () => {
    const old = receipt(), latest = receipt(0, 3);
    const f = await archive([{ ...old, cells: [{ ...old.cells[0], blocked: ['west'] }] }, receipt(0, 2, address(40)), latest]);
    const page = await rpgFrontiers(f.open().query, { limit: 12 });
    expect(page.frontiers).toEqual(directions.map(direction => ({ anchor: address(), direction, source: sourceOf(latest) })));
  });

  it.each([address(0, 0), address(Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER - 1)])
    ('never point-reads invalid next coordinates: %j', async actor => {
      const memory = (await archive([receipt(0, 1, actor)])).open();
      const page = await rpgFrontiers(memory.query, { limit: 12 });
      expect(page.frontiers.map(frontier => frontier.direction)).toEqual(actor.row === 0 ? ['east', 'south'] : ['north', 'west']);
      expect(memory.get).toHaveBeenCalledTimes(2);
    });

  it('paginates row/column/cardinal order independently of receipt array order and page size', async () => {
    const observation = receipt(2), reversed = { ...observation, cells: [...observation.cells].reverse() };
    const a = await archive([observation]), b = await archive([reversed]);
    const expected = observation.cells.flatMap(cell => directions.filter(direction => !cell.links.includes(direction))
      .map(direction => ({ anchor: cell.address, direction, source: sourceOf(observation) })));
    for (const limit of [1, 3, 12]) {
      const frontiers: typeof expected = [];
      let after: string | undefined;
      do {
        const input = { limit, snapshotId: observation.id, after };
        const page = await rpgFrontiers(a.open().query, input);
        expect(page).toEqual(await rpgFrontiers(b.open().query, input));
        expect(page.frontiers).toEqual(expected.slice(frontiers.length, frontiers.length + limit));
        frontiers.push(...page.frontiers);
        expect(page.truncated).toBe(frontiers.length < expected.length);
        expect(Object.hasOwn(page, 'next')).toBe(page.truncated);
        after = page.next;
      } while (after !== undefined);
      expect(frontiers).toEqual(expected);
    }
  });

  it.each([undefined, null, {}, { limit: 0 }, { limit: 13 }, { limit: 1.5 }, { limit: NaN }, { limit: Infinity },
    { limit: '1' }, { limit: 1, snapshotId: null }, { limit: 1, snapshotId: '' }, { limit: 1, snapshotId: 'other' },
    { limit: 1, after: '' }, { limit: 1, after: 'cursor' }, { limit: 1, after: null },
    { limit: 1, snapshotId: 'receipt-1', after: 'x'.repeat(2049) }])('rejects invalid requests before reads: %j', async input => {
    const memory = (await archive()).open();
    await expect(rpgFrontiers(memory.query, input as Parameters<typeof rpgFrontiers>[1])).rejects.toThrow(invalid);
    expect(memory.get).not.toHaveBeenCalled();
    expect(memory.cell).not.toHaveBeenCalled();
  });

  it('rejects noncanonical, foreign-scope, nonexistent and now-known cursor boundaries', async () => {
    const f = await archive(), first = await rpgFrontiers(f.open().query, { limit: 1 });
    const fields = JSON.parse(first.next!) as (string | number)[];
    const forged = [JSON.stringify(fields, null, 1), '{}', first.next! + ' ', first.next!.slice(0, -1)];
    for (const [index, value] of [[0, 'rooms'], [1, 'other-game'], [2, 'other-receipt'], [3, 2], [4, 99], [6, 'up']] as const) {
      const changed = [...fields]; changed[index] = value; forged.push(JSON.stringify(changed));
    }
    for (const after of forged) {
      const memory = f.open();
      await expect(rpgFrontiers(memory.query, { limit: 1, snapshotId: first.snapshotId, after })).rejects.toThrow(invalid);
      expect(memory.get).not.toHaveBeenCalled();
    }
    const missingSnapshot = f.open();
    await expect(rpgFrontiers(missingSnapshot.query, { limit: 1, after: first.next })).rejects.toThrow(invalid);
    expect(missingSnapshot.get).not.toHaveBeenCalled();
    const known = (await archive([receipt(0, 0, address(19)), receipt()])).open();
    await expect(rpgFrontiers(known.query, { limit: 1, snapshotId: first.snapshotId, after: first.next })).rejects.toThrow(invalid);
    expect(known.get).toHaveBeenCalledTimes(1);
  });

  it('rejects stale snapshots and transplanted cursors even when the supplied snapshot is current', async () => {
    const f = await archive([receipt(), receipt(0, 2)]);
    const first = await rpgFrontiers(f.open(0).query, { limit: 1 });
    for (const snapshotId of [first.snapshotId, 'receipt-2']) {
      const memory = f.open();
      await expect(rpgFrontiers(memory.query, { limit: 1, snapshotId, after: first.next })).rejects.toThrow(invalid);
      expect(memory.get).not.toHaveBeenCalled();
    }
  });

  it('rejects cursors naming open or blocked edges instead of receipt boundaries', async () => {
    const original = receipt(1), observation = { ...original, cells: original.cells.map((cell, index) =>
      index ? cell : { ...cell, blocked: ['north' as const] }) };
    const f = await archive([observation]), first = await rpgFrontiers(f.open().query, { limit: 1 });
    const fields = JSON.parse(first.next!) as (string | number)[];
    for (const direction of ['north', 'south']) {
      fields[6] = direction;
      const memory = f.open();
      await expect(rpgFrontiers(memory.query, { limit: 1, snapshotId: first.snapshotId, after: JSON.stringify(fields) }))
        .rejects.toThrow(invalid);
      expect(memory.get).not.toHaveBeenCalled();
    }
  });

  it('bounds a maximal 545-cell receipt and stops after one lookahead frontier', async () => {
    const observation = receipt(16), memory = (await archive([observation])).open();
    expect(observation.cells).toHaveLength(545);
    const page = await rpgFrontiers(memory.query, { limit: 12 });
    expect(page.frontiers).toHaveLength(12);
    expect(page.truncated).toBe(true);
    expect(memory.get.mock.calls.length).toBeLessThanOrEqual(13);
    expect(new Set(memory.get.mock.calls.flat()).size).toBe(memory.get.mock.calls.length);
    expect(memory.budget.stats().writes).toBe(0);
    const oversized = { ...memory.query, head: { ...memory.query.head,
      observation: { ...observation, cells: [...observation.cells, observation.cells[0]] } } };
    memory.get.mockClear();
    await expect(rpgFrontiers(oversized, { limit: 12 })).rejects.toThrow(invalid);
    expect(memory.get).not.toHaveBeenCalled();
  });

  it('reads each of the 68 unique neighbors once when all 545-cell receipt boundaries are remembered', async () => {
    const latest = receipt(16, 69), boundary = new Map<string, RpgAddress>();
    for (const cell of latest.cells) for (const direction of directions) {
      if (cell.links.includes(direction)) continue;
      const next = { floor: 1, ...movePosition(cell.address, direction) };
      boundary.set(cellMemoryKey(next), next);
    }
    const memory = (await archive([...boundary.values()].map((at, i) => receipt(0, i + 1, at)).concat(latest))).open();
    expect(await rpgFrontiers(memory.query, { limit: 12 })).toMatchObject({ frontiers: [], truncated: false });
    expect(memory.get).toHaveBeenCalledTimes(68);
    expect(memory.cell).toHaveBeenCalledTimes(68);
    expect(new Set(memory.get.mock.calls.flat())).toEqual(new Set(boundary.keys()));
    expect(memory.budget.stats().writes).toBe(0);
  });

  it('reads only current boundary neighbors in a memory larger than 2048 cells', async () => {
    const prior = Array.from({ length: 4 }, (_, index) => receipt(16, index + 1, address(200 + index * 100, 200)));
    expect(prior.reduce((count, observation) => count + observation.cells.length, 0)).toBeGreaterThan(2048);
    const latest = receipt(0, 5), memory = (await archive([...prior, latest])).open();
    const page = await rpgFrontiers(memory.query, { limit: 12 });
    expect(page.frontiers).toEqual(directions.map(direction => ({ anchor: address(), direction, source: sourceOf(latest) })));
    expect(memory.get.mock.calls.flat()).toEqual(directions.map(direction =>
      cellMemoryKey({ floor: 1, ...movePosition(address(), direction) })));
    expect(memory.reads.every(read => read.startsWith('node:'))).toBe(true);
    expect(memory.budget.stats().reads).toBeLessThan(40);
    expect(memory.budget.stats().writes).toBe(0);
  });

  it('has identical results and read work under unreachable hidden-world changes', async () => {
    const f = await archive([receipt(0, 1, address(18)), receipt(2, 2)]);
    const run = async (hidden: object) => {
      const memory = f.open();
      for (const name of ['game', 'maze', 'seed', 'geometry']) Object.defineProperty(memory.query, name, {
        get() { throw new Error(`Unreachable hidden-world read: ${name} ${Object.keys(hidden).length}`); },
      });
      const result = await rpgFrontiers(memory.query, { limit: 12 });
      return { result, work: memory.budget.stats(), reads: memory.reads, keys: memory.get.mock.calls,
        witnesses: memory.cell.mock.calls.map(([, at]) => at) };
    };
    expect(await run({ seed: 1, cells: [] })).toEqual(await run({ seed: 999, cells: ['different'], loot: 'unearned' }));
  });

  it('propagates forged facts, foreign ancestry, read exhaustion and cancellation instead of claiming unknown', async () => {
    const f = await archive([receipt(0, 1, address(19)), receipt(0, 2)]), key = cellMemoryKey(address(19));
    const value = await f.open().query.tree.get(key) as Extract<MemoryValue, { kind: 'cell' }>;
    for (const fact of [{ ...value.fact, roomIds: ['unearned'] }, { ...value.fact, source: { ...value.fact.source, id: 'receipt-2' } }]) {
      const memory = f.open(); memory.get.mockResolvedValueOnce({ kind: 'cell', fact });
      await expect(rpgFrontiers(memory.query, { limit: 12 })).rejects.toThrow(invalid);
    }
    const future = (await archive([receipt(), receipt(0, 2, address(19))])).open(0);
    future.get.mockResolvedValueOnce({ ...value, fact: { ...value.fact, source: sourceOf(receipt(0, 2, address(19))) } });
    await expect(rpgFrontiers(future.query, { limit: 12 })).rejects.toThrow('Invalid or unavailable observation history.');
    await expect(rpgFrontiers(f.open(undefined, { maxReads: 1 }).query, { limit: 12 })).rejects.toThrow('RPG memory read budget exhausted.');
    const controller = new AbortController(), cancelled = f.open(undefined, { signal: controller.signal });
    controller.abort();
    await expect(rpgFrontiers(cancelled.query, { limit: 12 })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('captures request primitives before asynchronous reads', async () => {
    const memory = (await archive()).open(), input = { limit: 1, snapshotId: 'receipt-1', after: undefined as string | undefined };
    const pending = rpgFrontiers(memory.query, input);
    input.limit = 12; input.snapshotId = 'different'; input.after = 'forged';
    const page = await pending;
    expect(page.frontiers).toHaveLength(1);
    expect(page.snapshotId).toBe('receipt-1');
    expect(page.truncated).toBe(true);
  });
});
