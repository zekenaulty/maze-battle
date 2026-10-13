import { describe, expect, it } from 'vitest';
import { ModuleAssembly } from '../../../domain/expedition/topology/modules/assembly';
import { createModuleRecipe, type ModulePolicy } from '../../../domain/expedition/topology/modules/policy';
import { moduleSpace } from '../../../domain/expedition/topology/modules/placement';
import { keyedSeed } from '../../../domain/expedition/topology/seed';
import { assignModuleRoles } from '../../../domain/maze/moduleRoles';
import type { CanonicalPages } from '../pages';
import type { CanonicalRecord } from '../types';
import { beginWorldRoomRoles, advanceWorldRoomRoles, loadWorldRoleCompilation, loadWorldRoomRole } from './roles';

function memory() {
  const rows = new Map<string, any>(), reads: string[] = [], writes: string[] = [];
  let fallback: (key: string) => unknown = () => undefined;
  const pages = {
    get: async (area: string, key: string) => {
      expect(area).toBe('world'); reads.push(key);
      const value = rows.get(key) ?? fallback(key);
      return value === undefined ? undefined : { value: structuredClone(value) } as CanonicalRecord;
    },
    set: async (area: string, key: string, value: unknown, indexes: string[] = []) => {
      expect(area).toBe('world'); expect(indexes).toEqual([]); writes.push(key);
      rows.set(key, JSON.parse(JSON.stringify(value)));
    },
    scan: async () => { throw Error('Role preparation must not scan'); },
  } as unknown as CanonicalPages;
  return { pages, rows, reads, writes, clear: () => { reads.length = 0; writes.length = 0; },
    fallback: (read: typeof fallback) => { fallback = read; } };
}

function fixture(seed = 42, count = 24, joins: ModulePolicy['joins'] = 'mixed') {
  const m = memory(), recipe = { ...createModuleRecipe('roles-unit', 1, seed), roomBudget: count };
  recipe.policy.joins = joins;
  const assembly = new ModuleAssembly(recipe).finish();
  const rooms = assembly.spaces.filter(space => space.kind === 'room');
  const expected = assignModuleRoles(rooms.map(space => ({ id: space.id, row: space.origin.row, column: space.origin.column,
    rows: space.rows, columns: space.columns, center: { row: Math.floor(space.rows / 2), column: Math.floor(space.columns / 2) } })), assembly.joins, seed);
  const distances = new Map([['entry', 0]]);
  for (const join of assembly.joins) {
    distances.set(join.toRoomId, distances.get(join.fromRoomId)! + 1);
    if (join.passageId) distances.set(join.passageId, distances.get(join.toRoomId)!);
  }
  const anchor = (id: string) => {
    const room = rooms.find(room => room.id === id)!;
    return { spaceId: id, row: Math.floor(room.rows / 2), column: Math.floor(room.columns / 2) };
  };
  const exit = anchor(expected.find(room => room.kind === 'exit')!.id);
  m.rows.set('dungeon', { schema: 1, worldId: recipe.worldId, deepestLevel: 1 });
  m.rows.set('dungeon/1', { schema: 1, level: 1, generation: { recipe, scopeId: assembly.scopeId,
    revision: count - 1, rooms: count, nextSequence: count - 1, pendingCount: 0 }, nextPending: count - 1,
    entry: anchor('entry'), farthest: { spaceId: exit.spaceId, distance: distances.get(exit.spaceId) }, exit });
  for (const spec of assembly.spaces) {
    m.rows.set(`dungeon/1/space/${spec.id}`, { schema: 1, level: 1, schematic: 'stone-room-v1', spec, distance: distances.get(spec.id) });
    m.rows.set(`dungeon/1/ports/${spec.id}`, { schema: 1, level: 1, spaceId: spec.id,
      connections: assembly.connections.filter(link => link.from.spaceId === spec.id || link.to.spaceId === spec.id).map(link => link.id), pending: [] });
  }
  for (const connection of assembly.connections) m.rows.set(`dungeon/1/connection/${connection.id}`, { schema: 1, level: 1, connection });
  return { ...m, assembly, expected };
}

async function finish(m: ReturnType<typeof memory>, limit = 8) {
  let state = await beginWorldRoomRoles(m.pages, 1);
  while (!state.plan) state = await advanceWorldRoomRoles(m.pages, 1, limit);
  return state;
}

describe('canonical role preparation', () => {
  for (const joins of ['direct', 'mixed', 'passage'] as const) for (const seed of [0, 42, 781]) {
    it(`matches compiled ModuleAssembly roles/names/tags for ${joins} seed ${seed}`, async () => {
      const m = fixture(seed, 24, joins), untouched = structuredClone([...m.rows]);
      let state = await beginWorldRoomRoles(m.pages, 1), step = 0;
      while (!state.plan) {
        const previous = state.nextRoom, limit = [1, 3, 8][step++ % 3];
        m.clear();
        state = await advanceWorldRoomRoles(m.pages, 1, limit);
        const roomReads = m.reads.filter(key => key.includes('/space/'));
        expect(roomReads).toEqual(Array.from({ length: state.nextRoom - previous }, (_, index) => {
          const ordinal = previous + index;
          return `dungeon/1/space/${ordinal === 0 ? 'entry' : `socket-${ordinal - 1}:room`}`;
        }));
        expect(m.reads.filter(key => /\/(space|ports)\//.test(key)).length).toBeLessThanOrEqual(16);
        expect(m.reads.length).toBeLessThanOrEqual(67);
        expect(m.reads.some(key => key.includes(':passage'))).toBe(false);
        expect(m.writes).toEqual(['dungeon/1/roles']);
        expect(state.accumulator.roomCount).toBe(state.nextRoom);
        expect(state.accumulator.specialties.length).toBeLessThanOrEqual(6);
        expect(JSON.stringify(state).length).toBeLessThan(1800);
        // Storage clones on every get/set, so every step resumes serialized state.
        expect(await loadWorldRoleCompilation(m.pages, 1)).toEqual(state);
      }
      expect(state.nextRoom).toBe(24); expect(state.plan!.specialtyIds).toHaveLength(5);
      for (const room of m.expected) {
        expect(await loadWorldRoomRole(m.pages, 1, room.id)).toEqual({ kind: room.kind, name: room.name, tags: room.tags });
      }
      m.clear();
      expect(await beginWorldRoomRoles(m.pages, 1)).toEqual(state);
      expect(await advanceWorldRoomRoles(m.pages, 1)).toEqual(state);
      expect(m.writes).toEqual([]);
      expect(m.reads.filter(key => /\/(space|ports)\//.test(key))).toEqual([]);
      expect([...m.rows].filter(([key]) => key !== 'dungeon/1/roles')).toEqual(untouched);
      expect(Object.keys(state).sort()).toEqual(['accumulator', 'binding', 'level', 'nextRoom', 'plan', 'schema']);
    });
  }

  it.each([3, 4, 7, 8, 9, 17])('finalizes exactly %i rooms, including a partial last batch', async count => {
    const m = fixture(0, count), state = await finish(m, count === 3 ? 1 : 8);
    expect(state.binding.roomCount).toBe(count); expect(state.nextRoom).toBe(count);
    expect(state.accumulator.roomCount).toBe(count);
    expect(state.plan!.specialtyIds).toHaveLength(Math.min(5, count - 3));
  });

  it('can resume begin and partial progress without reset or premature role lookup', async () => {
    const m = fixture();
    await expect(advanceWorldRoomRoles(m.pages, 1)).rejects.toThrow('has not begun');
    await beginWorldRoomRoles(m.pages, 1);
    const partial = await advanceWorldRoomRoles(m.pages, 1, 3);
    m.clear();
    expect(await beginWorldRoomRoles(m.pages, 1)).toEqual(partial); expect(m.writes).toEqual([]);
    await expect(loadWorldRoomRole(m.pages, 1, 'entry')).rejects.toThrow('not prepared');
  });

  it.each([0, -1, 1.5, 9, 16, 100, NaN, Infinity])('rejects invalid advance limit %s before reading', async limit => {
    const m = fixture();
    await expect(advanceWorldRoomRoles(m.pages, 1, limit)).rejects.toThrow('limit');
    expect(m.reads).toEqual([]); expect(m.writes).toEqual([]);
  });

  it('refuses unfinished generation instead of advancing it or publishing role readiness', async () => {
    const m = fixture(), floor = m.rows.get('dungeon/1');
    floor.generation.rooms--; floor.generation.revision--; floor.generation.pendingCount = 1; floor.nextPending--; floor.exit = null;
    const before = structuredClone([...m.rows]);
    await expect(beginWorldRoomRoles(m.pages, 1)).rejects.toThrow('completed generation');
    await expect(advanceWorldRoomRoles(m.pages, 1)).rejects.toThrow('completed generation');
    expect([...m.rows]).toEqual(before); expect(m.writes).toEqual([]);
  });

  it('never returns ordinary for a missing room, a passage or an out-of-scope identity', async () => {
    const m = fixture(781, 24, 'passage'); await finish(m);
    for (const id of ['unknown', 'socket-999:room', 'socket-00:room', 'socket-0:passage']) {
      await expect(loadWorldRoomRole(m.pages, 1, id)).rejects.toThrow('identity');
    }
    const ordinary = m.expected.find(room => room.kind === 'ordinary')!;
    m.rows.delete(`dungeon/1/space/${ordinary.id}`);
    await expect(loadWorldRoomRole(m.pages, 1, ordinary.id)).rejects.toThrow('missing established world record');
  });

  it('does bounded prefix work on a lazy 100,003-room floor without enumerating IDs or passage specs', async () => {
    const m = memory(), count = 100_003, recipe = { ...createModuleRecipe('large', 1, 42), roomBudget: count };
    const idAt = (n: number) => n === 0 ? 'entry' : `socket-${n - 1}:room`;
    const exit = { spaceId: idAt(count - 1), row: 2, column: 2 };
    m.rows.set('dungeon', { schema: 1, worldId: 'large', deepestLevel: 1 });
    m.rows.set('dungeon/1', { schema: 1, level: 1, generation: { recipe, scopeId: JSON.stringify(recipe),
      rooms: count, revision: count - 1, pendingCount: 0, nextSequence: count - 1 }, nextPending: count - 1,
      entry: { spaceId: 'entry', row: 2, column: 2 }, exit, farthest: { spaceId: exit.spaceId, distance: count - 1 } });
    m.fallback(key => {
      const match = /^dungeon\/1\/(space|ports|connection)\/(.+)$/.exec(key);
      if (!match) return undefined;
      const [, kind, id] = match;
      if (kind === 'connection') {
        const n = Number(/^socket-(\d+):door$/.exec(id)![1]);
        return { schema: 1, level: 1, connection: { id, direction: 'east',
          from: { spaceId: idAt(n), row: 2, column: 4 }, to: { spaceId: idAt(n + 1), row: 2, column: 0 } } };
      }
      const n = id === 'entry' ? 0 : Number(/^socket-(\d+):room$/.exec(id)![1]) + 1;
      if (kind === 'space') return { schema: 1, level: 1, schematic: 'stone-room-v1', distance: n,
        spec: moduleSpace(id, 'room', { row: 0, column: n * 5, rows: 5, columns: 5 }, keyedSeed(42, id)) };
      return { schema: 1, level: 1, spaceId: id, pending: [],
        connections: [...(n > 0 ? [`socket-${n - 1}:door`] : []), ...(n < count - 1 ? [`socket-${n}:door`] : [])] };
    });
    await beginWorldRoomRoles(m.pages, 1);
    for (let batch = 0; batch < 32; batch++) {
      m.clear();
      const state = await advanceWorldRoomRoles(m.pages, 1);
      expect(m.reads.length).toBeLessThanOrEqual(67);
      expect(m.reads.filter(key => /\/(space|ports)\//.test(key))).toHaveLength(16);
      expect(state.nextRoom).toBe((batch + 1) * 8);
      expect(JSON.stringify(state).length).toBeLessThan(1800);
      expect(state.plan).toBeNull();
      expect(m.rows.size).toBe(3);
    }
  });
});

describe('role corruption rejection', () => {
  const mutations: [string, (state: any) => void][] = [
    ['schema', s => { s.schema = 2; }], ['level', s => { s.level = 2; }],
    ['scope', s => { s.binding.scopeId += 'changed'; }], ['revision', s => { s.binding.revision++; }],
    ['count binding', s => { s.binding.roomCount++; }], ['entry binding', s => { s.binding.entryId = 'other'; }],
    ['exit binding', s => { s.binding.exitId = 'socket-0:room'; }], ['cursor', s => { s.nextRoom++; }],
    ['negative cursor', s => { s.nextRoom = -1; }], ['counter', s => { s.accumulator.roomCount++; }],
    ['seed', s => { s.accumulator.seed++; }], ['entry seen', s => { s.accumulator.entrySeen = false; }],
    ['exit seen', s => { s.accumulator.exitSeen = !s.accumulator.exitSeen; }],
    ['non-object hub', s => { s.accumulator.hub = false; }],
    ['hub degree', s => { s.accumulator.hub.degree = 5; }], ['future hub', s => { s.accumulator.hub.id = 'socket-20:room'; }],
    ['rank', s => { s.accumulator.specialties[0].rank++; }], ['order', s => { s.accumulator.specialties.reverse(); }],
    ['future candidate', s => { s.accumulator.specialties[0].id = 'socket-20:room'; }],
    ['oversized candidates', s => { s.accumulator.specialties.push(...s.accumulator.specialties); }],
    ['premature plan', s => { s.plan = {}; }], ['manifest', s => { s.allRoomIds = ['entry']; }],
  ];
  it.each(mutations)('rejects corrupt/stale %s on begin, advance and lookup without writing', async (_name, mutate) => {
    const m = fixture(); await beginWorldRoomRoles(m.pages, 1); await advanceWorldRoomRoles(m.pages, 1);
    mutate(m.rows.get('dungeon/1/roles')); m.clear();
    await expect(beginWorldRoomRoles(m.pages, 1)).rejects.toThrow();
    await expect(advanceWorldRoomRoles(m.pages, 1)).rejects.toThrow();
    await expect(loadWorldRoomRole(m.pages, 1, 'entry')).rejects.toThrow();
    expect(m.writes).toEqual([]);
  });

  it('binds completed plans to unchanged generation, rejects changed plans and refuses to reset them', async () => {
    const m = fixture(), state = await finish(m);
    const original = structuredClone(state);
    m.rows.get('dungeon/1/roles').plan.specialtyIds = [];
    await expect(loadWorldRoomRole(m.pages, 1, 'entry')).rejects.toThrow('plan');
    m.rows.set('dungeon/1/roles', original);
    const floor = m.rows.get('dungeon/1'); floor.generation.recipe.seed++;
    floor.generation.scopeId = JSON.stringify(floor.generation.recipe);
    m.clear();
    await expect(beginWorldRoomRoles(m.pages, 1)).rejects.toThrow('binding');
    await expect(advanceWorldRoomRoles(m.pages, 1)).rejects.toThrow('binding');
    await expect(loadWorldRoomRole(m.pages, 1, 'entry')).rejects.toThrow('binding');
    expect(m.writes).toEqual([]);
  });

  it.each(['space identity', 'space kind', 'space seed', 'ports identity', 'ports degree', 'pending', 'duplicate', 'missing link', 'foreign link'])
  ('refuses %s without advancing the stored cursor', async damage => {
    const m = fixture(); await beginWorldRoomRoles(m.pages, 1);
    const space = m.rows.get('dungeon/1/space/entry'), ports = m.rows.get('dungeon/1/ports/entry');
    const linkKey = `dungeon/1/connection/${ports.connections[0]}`;
    switch (damage) {
      case 'space identity': space.spec.id = 'other'; break;
      case 'space kind': space.spec.kind = 'passage'; break;
      case 'space seed': space.spec.seed++; break;
      case 'ports identity': ports.spaceId = 'other'; break;
      case 'ports degree': ports.connections = []; break;
      case 'pending': ports.pending.push('socket-999'); break;
      case 'duplicate': ports.connections.push(ports.connections[0]); break;
      case 'missing link': m.rows.delete(linkKey); break;
      case 'foreign link': m.rows.get(linkKey).connection.from.spaceId = 'other'; break;
    }
    const before = structuredClone(m.rows.get('dungeon/1/roles')); m.clear();
    await expect(advanceWorldRoomRoles(m.pages, 1)).rejects.toThrow();
    expect(m.rows.get('dungeon/1/roles')).toEqual(before); expect(m.writes).toEqual([]);
  });
});
