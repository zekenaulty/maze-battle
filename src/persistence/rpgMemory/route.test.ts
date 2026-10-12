import { afterEach, describe, expect, it, vi } from 'vitest';
import { address, fixture, identity, observed, projected, routeBudget } from '../../domain/agentic/knowledge/fixtures.test-support';
import { knownRpgRoute } from '../../domain/agentic/knowledge/route';
import type { RpgAddress, RpgKnowledge, RpgObservation, RpgRouteBudget } from '../../domain/agentic/knowledge/types';
import { ancestorIndex, observationLineage, observationReader } from '../observationNodes';
import type { RpgObservationNode } from '../observationTypes';
import { memoryBudget } from './budget';
import { deriveRpgMemory } from './derive';
import { memoryHeadWitness } from './heads';
import { cellMemoryKey } from './keys';
import type { MemoryQuery } from './query';
import { readRpgRoute, routeRpgMemory } from './route';
import { MemoryTree, type MemoryNode } from './tree';
import type { MemoryValue, MemoryWork } from './types';
import { memoryWitnesses } from './witnesses';

const database = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock('../saveRepository', () => ({ getDatabase: async () => database }));
afterEach(() => { vi.restoreAllMocks(); database.transaction.mockReset(); });

function line(start: number, count: number, revision = 1, floor = 1): RpgObservation {
  return { status: 'observed', version: 1, gameId: 'stored-route', ...identity(revision), actor: address(start, floor),
    policy: { kind: 'rpg-linked-bfs-v1', radius: count - 1 },
    cells: Array.from({ length: count }, (_, i) => ({ address: address(start + i, floor), roomIds: [], chests: [], stairs: [],
      links: [...(i ? ['west' as const] : []), ...(i + 1 < count ? ['east' as const] : [])], blocked: ['north', 'south'] })) };
}

// Only storage transport is mocked; derivation, radix reads, ancestry and witnesses are real.
async function archive(receipts: RpgObservation[] = [line(0, 3)]) {
  const nodes = new Map<string, MemoryNode>(), sources = new Map<string, RpgObservationNode>();
  const store = { async get(id: string) { return structuredClone(nodes.get(id)); },
    async add(node: MemoryNode) { nodes.set(node.id, structuredClone(node)); } };
  const reader = observationReader({ async get(id) { return sources.get(id); } }, receipts[0].gameId);
  const writer = new MemoryTree(store, null, memoryBudget({ maxReads: 65536, maxWrites: 65536 }));
  const snapshots: { head: RpgObservationNode; root: string | null; cellCount: number }[] = [];
  let cellCount = 0;
  for (const observation of receipts) {
    const metadata = { id: observation.id, gameId: observation.gameId, depth: snapshots.length + 1,
      ancestors: await ancestorIndex(reader, snapshots.at(-1)?.head) };
    sources.set(observation.id, { ...metadata, version: 1, observation, lineage: observationLineage(metadata) });
    const head = await reader.read(observation.id);
    cellCount = await deriveRpgMemory(writer, reader, head, cellCount);
    snapshots.push({ head, root: await writer.flush(), cellCount });
  }
  const open = (index = snapshots.length - 1, work: MemoryWork = {}) => {
    const { head, root } = snapshots[index], budget = memoryBudget(work), sourceReads: string[] = [];
    const reader = observationReader({ async get(id) {
      budget.read(); sourceReads.push(id); return structuredClone(sources.get(id));
    } }, head.gameId);
    const tree = new MemoryTree({ get: store.get, async add() { throw new Error('Route write'); } }, root, budget);
    vi.spyOn(tree, 'scan').mockImplementation(async () => { throw new Error('Route scan'); });
    const get = vi.spyOn(tree, 'get'), cell = vi.fn(memoryWitnesses(reader, head));
    return { query: { tree, head, cell } satisfies MemoryQuery, budget, get, cell, sourceReads };
  };
  const connect = (index = snapshots.length - 1) => {
    const { head, root, cellCount } = snapshots[index];
    const metadata = { id: head.id, gameId: head.gameId, depth: head.depth, root, cellCount };
    const slot: { game: { id: string }; observationHead?: string } = {
      game: new Proxy({ id: head.gameId }, { get(game, key) {
        if (key !== 'id') throw new Error('Hidden game read');
        return game.id;
      } }), observationHead: head.id,
    };
    const heads = new Map([[head.id, { ...metadata, witness: memoryHeadWitness(metadata) }]]);
    const reads: string[] = [], tx = { done: Promise.resolve(), abort: vi.fn(), objectStore(name: string) {
      return { async get(id: string) {
        reads.push(name);
        if (name === 'saves') return id === 'slot' ? slot : undefined;
        if (name === 'observations') return structuredClone(sources.get(id));
        if (name === 'rpgMemoryNodes') return structuredClone(nodes.get(id));
        if (name === 'rpgMemoryHeads') return structuredClone(heads.get(id));
        throw new Error('Unexpected store');
      } };
    } };
    database.transaction.mockImplementation((stores, mode) => {
      expect(stores).toEqual(['saves', 'observations', 'rpgMemoryNodes', 'rpgMemoryHeads']);
      expect(mode).toBe('readonly');
      return tx;
    });
    return { slot, heads, reads, tx };
  };
  return { nodes, sources, snapshots, open, connect, store };
}

describe('sparse stored known routes', () => {
  it('matches pure deterministic shortest paths, visits and source references', async () => {
    const game = fixture(2, 4);
    game.chests = [];
    game.maze.rows = 2;
    game.maze.cells = [
      { row: 0, column: 0, links: ['south', 'east'] }, { row: 0, column: 1, links: ['west', 'south'] },
      { row: 1, column: 0, links: ['east', 'north'] }, { row: 1, column: 1, links: ['north', 'west'] },
    ];
    const receipt = observed(game), f = await archive([receipt]), memory = f.open();
    const target = address(1, 1, 1), before = structuredClone([...f.nodes]);
    const route = await routeRpgMemory(memory.query, address(0), target, routeBudget);
    expect(route).toEqual(knownRpgRoute(projected(receipt), address(0), target, routeBudget));
    expect(route).toMatchObject({ status: 'ready', directions: ['east', 'south'], distance: 2, visits: 4 });
    expect(Object.isFrozen(route)).toBe(true);
    expect([...f.nodes]).toEqual(before);
    expect(memory.budget.stats().writes).toBe(0);
    expect(memory.get).toHaveBeenCalledTimes(4);
    expect(memory.cell).toHaveBeenCalledTimes(4);
  });

  it.each(['cropped', 'blocked', 'one-sided'] as const)('does not infer a route across %s links', async kind => {
    const receipts = kind === 'cropped' ? [line(0, 1), line(1, 1, 2)] : [line(0, 3)];
    if (kind !== 'cropped') {
      const blocked = line(kind === 'blocked' ? 0 : 1, 1, 2);
      receipts.push({ ...blocked, cells: [{ ...blocked.cells[0], blocked: [kind === 'blocked' ? 'east' : 'west'] }] });
    }
    const f = await archive(receipts), knowledge = receipts.reduce<RpgKnowledge | undefined>((prior, receipt) => projected(receipt, prior), undefined);
    const route = await routeRpgMemory(f.open().query, address(0), address(1), routeBudget);
    expect(route).toEqual(knownRpgRoute(knowledge!, address(0), address(1), routeBudget));
    expect(route).toEqual({ status: 'unknown', reason: 'no_known_route' });
  });

  it('retains earned edge sources when newer cropped observations only refresh cell details', async () => {
    const receipts = [line(0, 3), line(0, 1, 2), line(1, 2, 3)], f = await archive(receipts);
    const knowledge = receipts.reduce<RpgKnowledge | undefined>((prior, receipt) => projected(receipt, prior), undefined);
    const route = await routeRpgMemory(f.open().query, address(0), address(2), routeBudget);
    expect(route).toEqual(knownRpgRoute(knowledge!, address(0), address(2), routeBudget));
    expect(route.status).toBe('ready');
    if (route.status !== 'ready') throw new Error('Missing route');
    expect(route.sources.map(source => source.id)).toEqual(['observation-2', 'observation-3', 'observation-1']);
    expect(Object.isFrozen(route.sources[0].revision)).toBe(true);
  });

  it('returns unknown endpoints and refuses floor crossings without graph expansion', async () => {
    const f = await archive([line(0, 3), line(0, 3, 2, 2)]), memory = f.open();
    expect(await routeRpgMemory(memory.query, address(0), address(0, 2), routeBudget))
      .toEqual({ status: 'refused', reason: 'cross_floor' });
    expect(memory.get).not.toHaveBeenCalled();
    expect(await routeRpgMemory(memory.query, address(99), address(1), routeBudget))
      .toEqual({ status: 'unknown', reason: 'origin_unknown' });
    expect(await routeRpgMemory(memory.query, address(0), address(99), routeBudget))
      .toEqual({ status: 'unknown', reason: 'target_unknown' });
    expect(await routeRpgMemory(f.open().query, address(0, 2), address(2, 2), routeBudget))
      .toEqual(knownRpgRoute(projected(line(0, 3, 2, 2)), address(0, 2), address(2, 2), routeBudget));
  });

  it.each([
    { maxVisits: 1, maxSteps: 0 }, { maxVisits: 2, maxSteps: 2 },
    { maxVisits: 3, maxSteps: 1 }, { maxVisits: 3, maxSteps: 2 },
  ])('matches the pure route at exact visit and step bounds: %j', async budget => {
    const receipt = line(0, 3), f = await archive([receipt]);
    for (const target of [address(0), address(1), address(2)]) {
      expect(await routeRpgMemory(f.open().query, address(0), target, budget))
        .toEqual(knownRpgRoute(projected(receipt), address(0), target, budget));
    }
  });

  it.each([null, { maxVisits: 0, maxSteps: 1 }, { maxVisits: 513, maxSteps: 1 }, { maxVisits: 1.5, maxSteps: 1 },
    { maxVisits: NaN, maxSteps: 1 }, { maxVisits: 1, maxSteps: -1 }, { maxVisits: 1, maxSteps: 257 },
    { maxVisits: 1, maxSteps: Infinity }])('refuses invalid budgets without reads: %j', async budget => {
    const memory = (await archive()).open();
    expect(await routeRpgMemory(memory.query, address(0), address(1), budget as RpgRouteBudget))
      .toEqual({ status: 'refused', reason: 'invalid_budget' });
    expect(memory.get).not.toHaveBeenCalled();
  });

  it('enforces the 512-visit and 256-step ceilings on a long remembered corridor', async () => {
    const receipts = Array.from({ length: 33 }, (_, i) => line(i * 16, 17, i + 1)), f = await archive(receipts);
    const knowledge = receipts.reduce<RpgKnowledge | undefined>((prior, receipt) => projected(receipt, prior), undefined);
    for (const [column, outcome] of [[256, 'ready'], [257, 'step_limit'], [511, 'step_limit'], [512, 'visit_limit']] as const) {
      const result = await routeRpgMemory(f.open().query, address(0), address(column), routeBudget);
      expect(result).toEqual(knownRpgRoute(knowledge!, address(0), address(column), routeBudget));
      expect(result.status === 'ready' ? result.status : result.reason).toBe(outcome);
    }
  });

  it.each([null, address(-1), address(0, 0), address(Number.MAX_SAFE_INTEGER), address(0, 1, 0.5)])
    ('refuses invalid endpoints without reads: %j', async endpoint => {
      const memory = (await archive()).open();
      for (const [origin, target] of [[endpoint, address(1)], [address(0), endpoint]]) {
        expect(await routeRpgMemory(memory.query, origin as RpgAddress, target as RpgAddress, routeBudget))
          .toEqual({ status: 'refused', reason: 'invalid_checkpoint' });
      }
      expect(memory.get).not.toHaveBeenCalled();
    });

  it('reads only the bounded local route in a stored memory larger than 2048 cells', async () => {
    const receipts = Array.from({ length: 121 }, (_, i) => line(i * 32, 17, i + 1)), f = await archive(receipts);
    expect(f.snapshots.at(-1)!.cellCount).toBe(2057);
    const memory = f.open(), allowed = [address(0), address(1), address(2)].map(cellMemoryKey);
    const get = MemoryTree.prototype.get.bind(memory.query.tree);
    memory.get.mockImplementation(async key => {
      expect(allowed).toContain(key);
      return get(key);
    });
    expect(await routeRpgMemory(memory.query, address(0), address(2), { maxVisits: 3, maxSteps: 2 }))
      .toEqual(knownRpgRoute(projected(receipts[0]), address(0), address(2), { maxVisits: 3, maxSteps: 2 }));
    expect(memory.get).toHaveBeenCalledTimes(3);
    expect(memory.sourceReads.length).toBeLessThan(10);
    expect(memory.budget.stats().reads).toBeLessThan(40);
    expect(memory.budget.stats().writes).toBe(0);
  });

  it('propagates tree and witness read exhaustion and cancellation instead of returning unknown', async () => {
    const f = await archive(), memory = f.open();
    const originReads = memory.budget.stats().reads;
    await memory.query.tree.get(cellMemoryKey(address(0)));
    const treeReads = memory.budget.stats().reads - originReads;
    for (const maxReads of [1, treeReads]) {
      await expect(routeRpgMemory(f.open(undefined, { maxReads }).query, address(0), address(2), routeBudget))
        .rejects.toThrow('RPG memory read budget exhausted.');
    }
    const controller = new AbortController(), cancelled = f.open(undefined, { signal: controller.signal });
    controller.abort();
    await expect(routeRpgMemory(cancelled.query, address(0), address(2), routeBudget)).rejects.toMatchObject({ name: 'AbortError' });
    const active = new AbortController(), ongoing = f.open(undefined, { signal: active.signal });
    const witness = memoryWitnesses(observationReader({ async get(id) { return f.sources.get(id); } }, ongoing.query.head.gameId), ongoing.query.head);
    ongoing.cell.mockImplementationOnce(async (value, address) => { const cell = await witness(value, address); active.abort(); return cell; });
    await expect(routeRpgMemory(ongoing.query, address(0), address(2), routeBudget)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects forged remembered facts and sources from outside the selected snapshot', async () => {
    const f = await archive([line(0, 3), line(0, 3, 2)]);
    const old = f.open(0), newer = f.open(1), key = cellMemoryKey(address(1));
    const future = await newer.query.tree.get(key);
    const get = MemoryTree.prototype.get.bind(old.query.tree);
    old.get.mockImplementation(async requested => requested === key ? future : get(requested));
    await expect(routeRpgMemory(old.query, address(0), address(2), routeBudget)).rejects.toThrow('Invalid or unavailable');
    const forged = f.open();
    const value = structuredClone(await forged.query.tree.get(key)) as Extract<MemoryValue, { kind: 'cell' }>;
    value.fact = { ...value.fact, roomIds: ['unearned-room'] };
    const original = MemoryTree.prototype.get.bind(forged.query.tree);
    forged.get.mockImplementation(async requested => requested === key ? value : original(requested));
    await expect(routeRpgMemory(forged.query, address(0), address(2), routeBudget)).rejects.toThrow('Invalid or unavailable');
  });

  it('owns direct and wrapper request inputs before asynchronous reads', async () => {
    const f = await archive();
    for (const wrapper of [false, true]) {
      f.connect();
      const origin = address(0), target = address(2), budget = { maxVisits: 3, maxSteps: 2 };
      const pending = wrapper ? readRpgRoute('slot', origin, target, budget)
        : routeRpgMemory(f.open().query, origin, target, budget);
      origin.column = 99; target.column = 100; budget.maxSteps = 0;
      const result = await pending;
      expect(wrapper && result.status === 'ready' && 'data' in result ? result.data : result)
        .toMatchObject({ status: 'ready', origin: address(0), target: address(2), distance: 2 });
    }
  });
});

describe('snapshot-bound route query wrapper', () => {
  it('uses the selected query snapshot, reports read work and preserves unprepared results', async () => {
    const f = await archive([line(0, 2), line(1, 2, 2)]), storage = f.connect(0);
    expect(await readRpgRoute('slot', address(0), address(2), routeBudget, 'observation-1'))
      .toMatchObject({ status: 'ready', snapshotId: 'observation-1', data: { status: 'unknown', reason: 'target_unknown' } });
    const latest = f.connect(), result = await readRpgRoute('slot', address(0), address(2), routeBudget, 'observation-2');
    expect(result).toMatchObject({ status: 'ready', snapshotId: 'observation-2', data: { status: 'ready', distance: 2 }, work: { writes: 0 } });
    if (result.status !== 'ready') throw new Error('Missing query');
    expect(result.work.reads).toBe(latest.reads.length);
    expect(Object.isFrozen(result.data)).toBe(true);
    latest.heads.clear();
    expect(await readRpgRoute('slot', address(0), address(2), routeBudget))
      .toEqual({ status: 'unprepared', reason: 'index-incomplete', snapshotId: 'observation-2' });
    delete latest.slot.observationHead;
    expect(await readRpgRoute('slot', address(0), address(2), routeBudget)).toEqual({ status: 'unprepared', reason: 'no-observation' });
    expect(storage.tx.abort).not.toHaveBeenCalled();
  });

  it('rejects stale snapshots, forwards work limits and aborts failed queries', async () => {
    const f = await archive(), storage = f.connect();
    await expect(readRpgRoute('slot', address(0), address(2), routeBudget, 'other-snapshot')).rejects.toThrow('Invalid or unavailable');
    expect(storage.reads).toEqual(['saves']);
    await expect(readRpgRoute('slot', address(0), address(2), routeBudget, undefined, { maxReads: 1 }))
      .rejects.toThrow('RPG memory read budget exhausted.');
    expect(storage.tx.abort).toHaveBeenCalledTimes(2);
    const controller = new AbortController(); controller.abort();
    await expect(readRpgRoute('slot', address(0), address(2), routeBudget, undefined, { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(database.transaction).toHaveBeenCalledTimes(2);
  });
});
