import { describe, expect, it, vi } from 'vitest';
import { ModuleAssembly } from '../expedition/topology/modules/assembly';
import { createModuleRecipe } from '../expedition/topology/modules/policy';
import { keyedSeed } from '../expedition/topology/seed';
import { assignModuleRoles, type RoomEdge } from './moduleRoles';
import { accumulateModuleRole, createModuleRoleAccumulator, finalizeModuleRolePlan, resolveModuleRoomRole,
  type ModuleRoleAccumulator, type ModuleRolePlan, type ModuleRoleRoom } from './moduleRolePlan';
import type { RoomFootprint } from './structuredRooms';

function footprints(ids: string[]): (RoomFootprint & { id: string })[] {
  return ids.map((id, index) => ({ id, row: index * 5, column: 0, rows: 3, columns: 3,
    center: { row: index * 5 + 1, column: 1 } }));
}

const branched = footprints(['Entry', 'a', 'Z', '_1', '10', '2', 'b', 'c', 'd', 'e', 'exit', 'ordinary']);
const edges: RoomEdge[] = [
  ['Entry', 'a'], ['Entry', 'Z'], ['Z', '_1'], ['Z', '10'], ['Z', '2'],
  ['a', 'b'], ['a', 'c'], ['b', 'd'], ['b', 'e'], ['c', 'exit'], ['c', 'ordinary'],
].map(([fromRoomId, toRoomId]) => ({ fromRoomId, toRoomId }));

function accumulate(rooms: ModuleRoleRoom[], seed = 0, entryId = 'entry', exitId = 'exit') {
  return rooms.reduce(accumulateModuleRole, createModuleRoleAccumulator({ seed, entryId, exitId }));
}

function compareIncremental(rooms: ReturnType<typeof footprints>, links: RoomEdge[], seed: number) {
  const assigned = assignModuleRoles(rooms, links, seed);
  const entryId = assigned.find(room => room.kind === 'start')!.id;
  const exitId = assigned.find(room => room.kind === 'exit')!.id;
  const records = rooms.map(room => ({ id: room.id, degree: links.reduce((count, edge) => count
    + Number(edge.fromRoomId === room.id) + Number(edge.toRoomId === room.id), 0) }));
  const baseline = accumulate(records, seed, entryId, exitId);
  const orders = [records, [...records].reverse(), ...Array.from({ length: 10 }, (_, order) => [...records]
    .sort((a, b) => keyedSeed(order, a.id) - keyedSeed(order, b.id)))];
  for (const order of orders) {
    let state = createModuleRoleAccumulator({ entryId, exitId, seed });
    for (const record of order) {
      const before = JSON.stringify(state);
      const next = accumulateModuleRole(state, record);
      expect(JSON.stringify(state)).toBe(before);
      state = JSON.parse(JSON.stringify(next));
    }
    expect(state).toEqual(baseline);
    const plan = JSON.parse(JSON.stringify(finalizeModuleRolePlan(state)));
    expect(rooms.map(room => ({ ...room, ...resolveModuleRoomRole(plan, room.id) }))).toEqual(assigned);
  }
  return assigned;
}

describe('pre-extraction module role fixtures', () => {
  it('uses code-unit exit/hub ties but locale specialty ties, including an actual seed collision', () => {
    const star = footprints(['entry', 'a', 'Z', 'z']);
    expect(compareIncremental(star, star.slice(1).map(room => ({ fromRoomId: 'entry', toRoomId: room.id })), 0)
      .map(room => room.kind)).toEqual(['start', 'hub', 'exit', 'treasure']);
    const ids = ['entry', 'hub', 'Zuqs4Kmbauy9', 'sM_s-oIG3hEe', 'exit'];
    expect(ids.slice(2, 4).map(id => keyedSeed(0, `${id}:role`))).toEqual([3878645680, 3878645680]);
    const links = [['entry', 'hub'], ['hub', ids[2]], ['hub', ids[3]], [ids[2], 'exit']]
      .map(([fromRoomId, toRoomId]) => ({ fromRoomId, toRoomId }));
    expect(compareIncremental(footprints(ids), links, 0).map(room => room.kind))
      .toEqual(['start', 'hub', 'boss', 'treasure', 'exit']);
  });

  it('pins branched-floor output across seeds, including ordinary rooms', () => {
    expect([0, 42, 0xffffffff].map(seed => compareIncremental(branched, edges, seed)
      .map(room => `${room.id}=${room.kind}|${room.name}|${room.tags.join(',')}`))).toMatchInlineSnapshot(`
        [
          [
            "Entry=start|Entry Hall|safe,questRelevant",
            "a=ordinary|Chamber|",
            "Z=hub|Central Hub|safe,questRelevant",
            "_1=boss|Guard Post|hostile,rare,questRelevant",
            "10=safe|Sanctuary|safe,rare,questRelevant",
            "2=safe|Sanctuary|safe,rare,questRelevant",
            "b=ordinary|Chamber|",
            "c=ordinary|Chamber|",
            "d=exit|Descent Gate|questRelevant",
            "e=treasure|Vault|rare,questRelevant",
            "exit=treasure|Vault|rare,questRelevant",
            "ordinary=ordinary|Chamber|",
          ],
          [
            "Entry=start|Entry Hall|safe,questRelevant",
            "a=safe|Sanctuary|safe,rare,questRelevant",
            "Z=hub|Central Hub|safe,questRelevant",
            "_1=treasure|Vault|rare,questRelevant",
            "10=ordinary|Chamber|",
            "2=ordinary|Chamber|",
            "b=ordinary|Chamber|",
            "c=boss|Guard Post|hostile,rare,questRelevant",
            "d=exit|Descent Gate|questRelevant",
            "e=treasure|Vault|rare,questRelevant",
            "exit=ordinary|Chamber|",
            "ordinary=safe|Sanctuary|safe,rare,questRelevant",
          ],
          [
            "Entry=start|Entry Hall|safe,questRelevant",
            "a=ordinary|Chamber|",
            "Z=hub|Central Hub|safe,questRelevant",
            "_1=ordinary|Chamber|",
            "10=ordinary|Chamber|",
            "2=treasure|Vault|rare,questRelevant",
            "b=boss|Guard Post|hostile,rare,questRelevant",
            "c=ordinary|Chamber|",
            "d=exit|Descent Gate|questRelevant",
            "e=treasure|Vault|rare,questRelevant",
            "exit=safe|Sanctuary|safe,rare,questRelevant",
            "ordinary=safe|Sanctuary|safe,rare,questRelevant",
          ],
        ]
      `);
  });

  it('pins generated module floors across recipes and seeds', () => {
    expect([0, 42, 0xffffffff].map(seed => {
      const assembly = new ModuleAssembly(createModuleRecipe('role-fixture', 2, seed)).finish();
      return compareIncremental(footprints(assembly.spaces.filter(space => space.kind === 'room').map(space => space.id)),
        assembly.joins, seed).map(room => `${room.id}=${room.kind}|${room.name}|${room.tags.join(',')}`);
    })).toMatchInlineSnapshot(`
      [
        [
          "entry=start|Entry Hall|safe,questRelevant",
          "socket-0:room=hub|Central Hub|safe,questRelevant",
          "socket-1:room=treasure|Vault|rare,questRelevant",
          "socket-2:room=ordinary|Chamber|",
          "socket-3:room=safe|Sanctuary|safe,rare,questRelevant",
          "socket-4:room=exit|Descent Gate|questRelevant",
          "socket-5:room=boss|Guard Post|hostile,rare,questRelevant",
          "socket-6:room=treasure|Vault|rare,questRelevant",
          "socket-7:room=ordinary|Chamber|",
          "socket-8:room=safe|Sanctuary|safe,rare,questRelevant",
        ],
        [
          "entry=start|Entry Hall|safe,questRelevant",
          "socket-0:room=hub|Central Hub|safe,questRelevant",
          "socket-1:room=ordinary|Chamber|",
          "socket-2:room=ordinary|Chamber|",
          "socket-3:room=treasure|Vault|rare,questRelevant",
          "socket-4:room=exit|Descent Gate|questRelevant",
          "socket-5:room=safe|Sanctuary|safe,rare,questRelevant",
          "socket-6:room=safe|Sanctuary|safe,rare,questRelevant",
          "socket-7:room=boss|Guard Post|hostile,rare,questRelevant",
          "socket-8:room=treasure|Vault|rare,questRelevant",
        ],
        [
          "entry=start|Entry Hall|safe,questRelevant",
          "socket-0:room=hub|Central Hub|safe,questRelevant",
          "socket-1:room=boss|Guard Post|hostile,rare,questRelevant",
          "socket-2:room=treasure|Vault|rare,questRelevant",
          "socket-3:room=ordinary|Chamber|",
          "socket-4:room=exit|Descent Gate|questRelevant",
          "socket-5:room=ordinary|Chamber|",
          "socket-6:room=treasure|Vault|rare,questRelevant",
          "socket-7:room=safe|Sanctuary|safe,rare,questRelevant",
          "socket-8:room=safe|Sanctuary|safe,rare,questRelevant",
        ],
      ]
    `);
  });
});

describe('bounded incremental module role planning', () => {
  const endpoints = [{ id: 'entry', degree: 100 }, { id: 'exit', degree: 100 }];

  it.each([3, 4, 5, 6, 7, 8, 9, 20])('matches full-floor assignment for %i rooms', count => {
    const rooms = footprints(Array.from({ length: count }, (_, index) => `room-${index}`));
    const links = rooms.slice(1).map((room, index) => ({ fromRoomId: rooms[index].id, toRoomId: room.id }));
    const assigned = compareIncremental(rooms, links, 12345);
    expect(assigned.filter(room => room.kind !== 'ordinary')).toHaveLength(Math.min(count, 8));
  });

  it.each([0, 1, 2, 3, 4, 5, 6, 7])('reserves the sixth candidate when the late hub is rank %i', hubRank => {
    const ranked = Array.from({ length: 8 }, (_, index) => `candidate-${index}`)
      .sort((a, b) => keyedSeed(0, `${a}:role`) - keyedSeed(0, `${b}:role`));
    const hubId = ranked[hubRank];
    const rooms = [...endpoints, ...ranked.filter(id => id !== hubId).map(id => ({ id, degree: 1 })), { id: hubId, degree: 2 }];
    const state = accumulate(rooms);
    expect(state).toEqual(accumulate([...rooms].reverse()));
    expect(state.specialties.map(candidate => candidate.id)).toEqual(ranked.slice(0, 6));
    expect(finalizeModuleRolePlan(state)).toEqual({ entryId: 'entry', exitId: 'exit', hubId,
      specialtyIds: ranked.filter(id => id !== hubId).slice(0, 5) });
  });

  it('resolves exact IDs, all kinds/names/tags, and ordinary defaults without mutable shared tags', () => {
    const plan = { entryId: '__proto__', exitId: 'constructor', hubId: 'toString',
      specialtyIds: ['vault', 'guard', 'safe-1', 'vault-2', 'safe-2'] };
    const ids = [plan.entryId, plan.exitId, plan.hubId, ...plan.specialtyIds, 'vault-extra', 'Vault'];
    expect(ids.map(id => resolveModuleRoomRole(plan, id))).toEqual([
      { kind: 'start', name: 'Entry Hall', tags: ['safe', 'questRelevant'] },
      { kind: 'exit', name: 'Descent Gate', tags: ['questRelevant'] },
      { kind: 'hub', name: 'Central Hub', tags: ['safe', 'questRelevant'] },
      { kind: 'treasure', name: 'Vault', tags: ['rare', 'questRelevant'] },
      { kind: 'boss', name: 'Guard Post', tags: ['hostile', 'rare', 'questRelevant'] },
      { kind: 'safe', name: 'Sanctuary', tags: ['safe', 'rare', 'questRelevant'] },
      { kind: 'treasure', name: 'Vault', tags: ['rare', 'questRelevant'] },
      { kind: 'safe', name: 'Sanctuary', tags: ['safe', 'rare', 'questRelevant'] },
      { kind: 'ordinary', name: 'Chamber', tags: [] },
      { kind: 'ordinary', name: 'Chamber', tags: [] },
    ]);
    resolveModuleRoomRole(plan, '__proto__').tags.pop();
    expect(resolveModuleRoomRole(plan, '__proto__').tags).toEqual(['safe', 'questRelevant']);
    const unusual = ['__proto__', 'constructor', 'toString', 'Room', 'room', '\u00e9', 'e\u0301', 'x'.repeat(128)];
    const state = accumulate(unusual.map(id => ({ id, degree: 1 })), 0, unusual[0], unusual[1]);
    expect(state).toEqual(accumulate(unusual.map(id => ({ id, degree: 1 })).reverse(), 0, unusual[0], unusual[1]));
  });

  it('uses a final code-unit tie-break when distinct hash-colliding IDs collate equally', () => {
    const compare = vi.spyOn(String.prototype, 'localeCompare').mockReturnValue(0);
    try {
      const rooms = [...endpoints, { id: 'hub', degree: 2 },
        { id: 'sM_s-oIG3hEe', degree: 1 }, { id: 'Zuqs4Kmbauy9', degree: 1 }];
      const state = accumulate(rooms);
      expect(state).toEqual(accumulate([...rooms].reverse()));
      expect(finalizeModuleRolePlan(state).specialtyIds).toEqual(['Zuqs4Kmbauy9', 'sM_s-oIG3hEe']);
    } finally {
      compare.mockRestore();
    }
  });

  it('applies the locale rank tie-break at the bounded shortlist cutoff', () => {
    const tied = ['Zuqs4Kmbauy9', 'sM_s-oIG3hEe'];
    const lower = Array.from({ length: 20 }, (_, index) => `low-${index}`)
      .filter(id => keyedSeed(0, `${id}:role`) < 3878645680).slice(0, 5);
    expect(lower).toHaveLength(5);
    const rooms = [...endpoints, ...lower.map((id, index) => ({ id, degree: index === 0 ? 2 : 1 })),
      ...tied.map(id => ({ id, degree: 1 }))];
    const state = accumulate(rooms);
    expect(state).toEqual(accumulate([...rooms].reverse()));
    expect(state.specialties).toHaveLength(6);
    expect(finalizeModuleRolePlan(state).specialtyIds.at(-1)).toBe(tied[1]);
    expect(resolveModuleRoomRole(finalizeModuleRolePlan(state), tied[0]).kind).toBe('ordinary');
  });

  it('keeps state bounded for 100,000 rooms in either order, including serialized resumptions', () => {
    const count = 100_000;
    const id = (index: number) => `room-${String(index).padStart(6, '0')}`;
    const scope = { entryId: id(0), exitId: id(count - 1), seed: 42 };
    let forward = createModuleRoleAccumulator(scope);
    let reverse = createModuleRoleAccumulator(scope);
    let maxCandidates = 0;
    let maxBytes = 0;
    for (let index = 0; index < count; index++) {
      forward = accumulateModuleRole(forward, { id: id(index), degree: index % 11 });
      reverse = accumulateModuleRole(reverse, { id: id(count - index - 1), degree: (count - index - 1) % 11 });
      maxCandidates = Math.max(maxCandidates, forward.specialties.length, reverse.specialties.length);
      maxBytes = Math.max(maxBytes, JSON.stringify(forward).length, JSON.stringify(reverse).length);
      if (index % 997 === 0) {
        forward = JSON.parse(JSON.stringify(forward));
        reverse = JSON.parse(JSON.stringify(reverse));
      }
    }
    expect(forward).toEqual(reverse);
    expect(forward.roomCount).toBe(count);
    expect(Object.keys(forward).sort()).toEqual(['entryId', 'entrySeen', 'exitId', 'exitSeen', 'hub', 'roomCount', 'seed', 'specialties']);
    expect(maxCandidates).toBe(6);
    expect(maxBytes).toBeLessThan(700);
    const plan = finalizeModuleRolePlan(forward);
    expect(plan.hubId).toBe(id(10));
    expect(plan.specialtyIds).toHaveLength(5);
    expect(JSON.stringify(plan).length).toBeLessThan(250);
    const counts: Record<string, number> = {};
    for (let index = 0; index < count; index++) {
      const role = resolveModuleRoomRole(plan, id(index));
      counts[role.kind] = (counts[role.kind] ?? 0) + 1;
    }
    expect(counts).toEqual({ start: 1, exit: 1, hub: 1, treasure: 2, boss: 1, safe: 2, ordinary: count - 8 });
  }, 30_000);

  it('does not mutate frozen inputs, plans or geometry', () => {
    const state = accumulate([...endpoints, { id: 'hub', degree: 2 }]);
    Object.freeze(state.hub);
    state.specialties.forEach(Object.freeze);
    Object.freeze(state.specialties);
    Object.freeze(state);
    const next = accumulateModuleRole(state, Object.freeze({ id: 'new-room', degree: 1 }));
    const plan = finalizeModuleRolePlan(next);
    Object.freeze(plan.specialtyIds);
    Object.freeze(plan);
    expect(resolveModuleRoomRole(plan, 'new-room').kind).toBe('treasure');
    const before = structuredClone(branched);
    const assigned = assignModuleRoles(branched, edges, 42);
    expect(branched).toEqual(before);
    assigned.forEach((room, index) => {
      expect(room.center).toEqual(branched[index].center);
      expect(room.center).not.toBe(branched[index].center);
    });
  });
});

describe('module role input validation', () => {
  const scope = { entryId: 'entry', exitId: 'exit', seed: 0 };

  it.each([-1, 1.5, NaN, Infinity, 0x100000000, '0', null])('rejects invalid seed %s', seed => {
    expect(() => createModuleRoleAccumulator({ ...scope, seed: seed as number })).toThrow(/Seed/);
  });

  it.each(['', ' ', 'x'.repeat(129), 1, null, undefined])('rejects invalid ID %s', id => {
    expect(() => createModuleRoleAccumulator({ ...scope, entryId: id as string })).toThrow(/identity/);
    expect(() => createModuleRoleAccumulator({ ...scope, exitId: id as string })).toThrow(/identity/);
    expect(() => accumulateModuleRole(createModuleRoleAccumulator(scope), { id: id as string, degree: 0 })).toThrow(/identity/);
    expect(() => resolveModuleRoomRole({ ...scope, hubId: 'hub', specialtyIds: [] }, id as string)).toThrow(/identity/);
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null])('rejects invalid degree %s', degree => {
    expect(() => accumulateModuleRole(createModuleRoleAccumulator(scope), { id: 'room', degree: degree as number })).toThrow(/degree/);
  });

  it('requires distinct endpoints, at least three rooms, and both endpoints visited', () => {
    expect(() => createModuleRoleAccumulator({ ...scope, exitId: 'entry' })).toThrow(/distinct/);
    expect(() => finalizeModuleRolePlan(createModuleRoleAccumulator(scope))).toThrow(/needs/);
    expect(() => finalizeModuleRolePlan(accumulate([{ id: 'entry', degree: 1 }, { id: 'exit', degree: 1 }]))).toThrow(/needs/);
    expect(() => finalizeModuleRolePlan(accumulate(['a', 'b', 'c'].map(id => ({ id, degree: 0 }))))).toThrow(/Missing entry/);
    for (const missing of ['entry', 'exit']) {
      expect(() => finalizeModuleRolePlan(accumulate(['entry', 'exit', 'a', 'b'].filter(id => id !== missing)
        .map(id => ({ id, degree: 1 }))))).toThrow(/Missing entry/);
    }
    const minimum = accumulate(['entry', 'exit', 'hub'].map(id => ({ id, degree: 0 })));
    expect(finalizeModuleRolePlan(minimum)).toEqual({ entryId: 'entry', exitId: 'exit', hubId: 'hub', specialtyIds: [] });
  });

  it('rejects duplicate retained identities and safe-count overflow without changing state', () => {
    const state = accumulate(['entry', 'exit', 'hub', 'special'].map(id => ({ id, degree: 1 })));
    const before = JSON.stringify(state);
    for (const id of ['entry', 'exit', 'hub', 'special']) {
      expect(() => accumulateModuleRole(state, { id, degree: 2 })).toThrow(/Duplicate/);
    }
    const full = accumulate(['entry', 'exit', 'hub', 'a', 'b', 'c', 'd', 'e'].map(id => ({ id, degree: 1 })));
    expect(() => accumulateModuleRole({ ...full, roomCount: Number.MAX_SAFE_INTEGER }, { id: 'new', degree: 1 })).toThrow(/count/);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('validates resumed accumulator bounds and consistency before accepting a room', () => {
    const state = accumulate(['entry', 'exit', 'hub'].map(id => ({ id, degree: 1 })));
    const invalid = [null, { ...state, roomCount: -1 }, { ...state, roomCount: 1.5 },
      { ...state, entrySeen: 1 }, { ...state, roomCount: 0 }, { ...state, hub: null },
      { ...state, hub: { id: 'entry', degree: 2 } }, { ...state, hub: { id: 'other', degree: 2 } },
      { ...state, specialties: Array(7).fill(state.specialties[0]) },
      { ...state, specialties: [{ id: 'hub', rank: -1 }] },
      { ...state, specialties: [{ id: 'entry', rank: keyedSeed(0, 'entry:role') }] },
    ];
    for (const value of invalid) {
      expect(() => accumulateModuleRole(value as ModuleRoleAccumulator, { id: 'new', degree: 1 })).toThrow();
      expect(() => finalizeModuleRolePlan(value as ModuleRoleAccumulator)).toThrow();
    }
    const multiple = accumulate(['entry', 'exit', 'hub', 'a', 'b'].map(id => ({ id, degree: 1 })));
    expect(() => finalizeModuleRolePlan({ ...multiple, specialties: [...multiple.specialties].reverse() })).toThrow(/candidate/);
    expect(() => finalizeModuleRolePlan({ ...multiple, roomCount: 9, specialties: Array(6) })).toThrow(/candidate/);
    expect(() => accumulateModuleRole(state, null as never)).toThrow(/Missing module room/);
  });

  it('rejects malformed, oversized and overlapping final plans', () => {
    const plan = { entryId: 'entry', exitId: 'exit', hubId: 'hub', specialtyIds: [] };
    for (const invalid of [null, { ...plan, hubId: 'entry' }, { ...plan, specialtyIds: Array(6).fill('a') },
      { ...plan, specialtyIds: ['a', 'a'] }, { ...plan, specialtyIds: ['hub'] }, { ...plan, specialtyIds: [''] }]) {
      expect(() => resolveModuleRoomRole(invalid as ModuleRolePlan, 'a')).toThrow();
    }
  });

  it('preserves full-floor graph checks and counts duplicate/self-loop edges as before', () => {
    expect(() => assignModuleRoles(branched.slice(0, 2), [], 0)).toThrow(/needs/);
    expect(() => assignModuleRoles([branched[0], branched[1], branched[1]], [], 0)).toThrow(/Duplicate/);
    expect(() => assignModuleRoles(branched, [{ fromRoomId: 'Entry', toRoomId: 'absent' }], 0)).toThrow(/Dangling/);
    expect(() => assignModuleRoles(branched, [], 0)).toThrow(/Disconnected/);
    const links = [...edges, edges[0], { fromRoomId: 'a', toRoomId: 'a' }];
    expect(compareIncremental(branched, links, 42).find(room => room.kind === 'hub')!.id).toBe('a');
  });
});
