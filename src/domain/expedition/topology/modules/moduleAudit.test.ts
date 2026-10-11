import { describe, expect, it } from 'vitest';
import { assignModuleRoles } from '../../../maze/moduleRoles';
import type { SpaceSpec } from '../../types';
import { ModuleAssembly } from './assembly';
import { createModuleRecipe, type ModulePolicy } from './policy';
import { assertModuleQuality, moduleQuality } from './quality';
import { ModuleCapacityError, type ModuleAssemblyState, type ModuleDelta } from './types';

// Deliberately excludes all six seeds in the original D1.2 corpus.
const SEEDS = [0, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 17, 23, 31, 63,
  127, 255, 65535, 65536, 0x7fffffff, 0x80000000, 0xfffffffe, 20261012];
const BUDGETS = [7, 11, 13, 16, 32, 64, 128, 256];
const recipeFor = (seed: number, roomBudget: number, policy: Partial<ModulePolicy> = {}) => {
  const recipe = createModuleRecipe('d1-audit', 1, seed);
  return { ...recipe, roomBudget, policy: { ...recipe.policy, ...policy } };
};
const bounds = (space: SpaceSpec) => ({ ...space.origin, rows: space.rows, columns: space.columns });
type Rectangle = ReturnType<typeof bounds>;
const intersects = (a: Rectangle, b: Rectangle) =>
  Math.max(a.row, b.row) < Math.min(a.row + a.rows, b.row + b.rows)
  && Math.max(a.column, b.column) < Math.min(a.column + a.columns, b.column + b.columns);

function verifyGeometry(state: ModuleAssemblyState) {
  const spaces = new Map(state.spaces.map(space => [space.id, space]));
  expect(spaces.size).toBe(state.spaces.length);
  expect(new Set(state.joins.map(join => join.id)).size).toBe(state.joins.length);
  expect(new Set(state.connections.map(link => link.id)).size).toBe(state.connections.length);
  const rectangles = [...state.spaces.map(space => ({ id: space.id, ...bounds(space) })),
    ...state.pending.map(socket => ({ id: socket.id, ...socket.reservation.bounds }))];
  const collisions: string[] = [];
  for (let a = 0; a < rectangles.length; a++) for (let b = a + 1; b < rectangles.length; b++) {
    if (intersects(rectangles[a], rectangles[b])) collisions.push(`${rectangles[a].id}/${rectangles[b].id}`);
  }
  expect(collisions).toEqual([]);
  const ports = new Set<string>();
  const vectors = { north: [-1, 0], east: [0, 1], south: [1, 0], west: [0, -1] } as const;
  for (const link of state.connections) {
    const source = spaces.get(link.from.spaceId)!;
    const target = spaces.get(link.to.spaceId)!;
    expect(source).toBeDefined();
    expect(target).toBeDefined();
    const [dr, dc] = vectors[link.direction];
    expect([source.origin.row + link.from.row + dr, source.origin.column + link.from.column + dc])
      .toEqual([target.origin.row + link.to.row, target.origin.column + link.to.column]);
    for (const [space, cell, rowStep, columnStep] of [[source, link.from, dr, dc], [target, link.to, -dr, -dc]] as const) {
      expect(cell.row).toBeGreaterThanOrEqual(0);
      expect(cell.row).toBeLessThan(space.rows);
      expect(cell.column).toBeGreaterThanOrEqual(0);
      expect(cell.column).toBeLessThan(space.columns);
      // A one-cell passage legitimately uses opposite faces of the same cell.
      const key = `${space.id}:${cell.row}:${cell.column}:${rowStep}:${columnStep}`;
      expect(ports.has(key), `reused door ${key}`).toBe(false);
      ports.add(key);
    }
  }
  for (const join of state.joins) {
    expect(spaces.get(join.fromRoomId)?.kind).toBe('room');
    expect(spaces.get(join.toRoomId)?.kind).toBe('room');
    const links = state.connections.filter(link => link.id.startsWith(`${join.id}:`));
    expect(links).toHaveLength(join.passageId ? 2 : 1);
    if (join.passageId) expect(spaces.get(join.passageId)?.kind).toBe('passage');
  }
  for (const space of state.spaces) {
    expect(space.chests).toEqual([]);
    if (space.kind === 'room') {
      for (const size of [space.rows, space.columns]) {
        expect(size % 2).toBe(1);
        expect(size).toBeGreaterThanOrEqual(state.recipe.policy.minSide);
        expect(size).toBeLessThanOrEqual(state.recipe.policy.maxSide);
      }
    } else {
      expect(Math.min(space.rows, space.columns)).toBe(1);
      expect(Math.max(space.rows, space.columns)).toBeLessThanOrEqual(state.recipe.policy.maxPassage);
    }
  }
}

function graphMetrics(state: ModuleAssemblyState) {
  const graph = new Map(state.spaces.filter(space => space.kind === 'room').map(space => [space.id, [] as string[]]));
  for (const join of state.joins) {
    graph.get(join.fromRoomId)!.push(join.toRoomId);
    graph.get(join.toRoomId)!.push(join.fromRoomId);
  }
  const walk = (root: string) => {
    const distance = new Map([[root, 0]]);
    const parent = new Map<string, string>();
    const queue = [root];
    for (const id of queue) for (const next of graph.get(id)!) {
      if (distance.has(next)) continue;
      parent.set(next, id);
      distance.set(next, distance.get(id)! + 1);
      queue.push(next);
    }
    return { distance, parent, depth: Math.max(...distance.values()), farthest: queue.at(-1)! };
  };
  const entry = walk('entry');
  const route = new Set([entry.farthest]);
  let cursor = entry.farthest;
  while (entry.parent.has(cursor)) { cursor = entry.parent.get(cursor)!; route.add(cursor); }
  const sideDepths = [...graph].filter(([id, neighbors]) => neighbors.length === 1 && !route.has(id)).map(([id]) => {
    let depth = 0;
    while (!route.has(id)) { id = entry.parent.get(id)!; depth++; }
    return depth;
  });
  const depths = [...graph.keys()].map(id => walk(id).depth);
  return { reachable: entry.distance.size, forks: [...graph.values()].filter(edges => edges.length >= 3).length,
    leaves: [...graph.values()].filter(edges => edges.length === 1).length,
    depth: entry.depth, diameter: Math.max(...depths), sideDepths };
}

const footprints = (state: ModuleAssemblyState) => state.spaces.filter(space => space.kind === 'room').map(space => ({
  id: space.id, ...bounds(space), center: { row: space.origin.row + Math.floor(space.rows / 2),
    column: space.origin.column + Math.floor(space.columns / 2) },
}));
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
};

describe('D1.2 independent assembler audit', () => {
  it('keeps reservations and geometry disjoint through every commit, including a JSON replay after completion', () => {
    const builder = new ModuleAssembly(recipeFor(23, 64));
    const receipts: ModuleDelta[] = [];
    while (!builder.complete) {
      const before = builder.snapshot();
      verifyGeometry(before);
      const first = builder.propose(before.revision, `audit-${before.revision}`)!;
      const second = builder.propose(before.revision, `competing-${before.revision}`)!;
      expect(builder.snapshot()).toEqual(before);
      expect(builder.commit(first).status).toBe('applied');
      expect(builder.commit(second).status).toBe('conflict');
      const after = builder.snapshot();
      expect(after.rooms).toBe(before.rooms + 1);
      expect(after.pending.some(socket => socket.id === first.resolved)).toBe(false);
      expect(after.pending.length + after.rooms).toBeLessThanOrEqual(after.recipe.roomBudget);
      receipts.push(first);
    }
    const complete = builder.snapshot();
    verifyGeometry(complete);
    const work = builder.work;
    for (const delta of receipts.reverse()) {
      expect(builder.commit(JSON.parse(JSON.stringify(delta)))).toEqual({ status: 'duplicate', revision: delta.expectedRevision + 1 });
    }
    expect(builder.snapshot()).toEqual(complete);
    expect(builder.work).toEqual(work);
  });

  it('rejects forged data, foreign scopes and stale proposals without poisoning later valid commits', () => {
    const recipe = recipeFor(5, 32);
    const builder = new ModuleAssembly(recipe);
    const before = builder.snapshot();
    const delta = builder.propose(0, 'valid')!;
    const attacks: ((value: ModuleDelta) => void)[] = [
      value => { value.resolved = 'other-socket'; },
      value => { value.spaces[0].origin.row += 1; },
      value => { value.spaces[0].id = 'entry'; },
      value => { value.connections[0].to.column += 1; },
      value => { value.pending = []; },
      value => { value.pending[0].reservation.bounds.rows += 1; },
      value => { value.pending[0].room.origin.column += 1; },
      value => { value.work.candidates += 1; },
    ];
    for (const attack of attacks) {
      const corrupt = structuredClone(delta);
      attack(corrupt);
      expect(() => builder.commit(corrupt)).toThrow(/Invalid module proposal/);
      expect(builder.snapshot()).toEqual(before);
    }
    for (const foreign of [{ ...recipe, floorId: 'floor-2' }, { ...recipe, worldId: 'other-world' }, recipeFor(6, 32)]) {
      expect(builder.commit(new ModuleAssembly(foreign).propose(0, 'valid')!).status).toBe('conflict');
    }
    expect(builder.commit(delta).status).toBe('applied');
    expect(builder.finish()).toEqual(new ModuleAssembly(recipe).finish());
  });

  it('owns recipe, pending geometry, commit data, snapshots and work counters without aliasing callers', () => {
    const recipe = recipeFor(3, 32);
    const reference = new ModuleAssembly(recipe).finish();
    const builder = new ModuleAssembly(recipe);
    recipe.policy.minSide = 15;
    recipe.seed = 99;
    const before = builder.snapshot();
    const observation = builder.snapshot();
    observation.pending[0].room.origin.row = 10000;
    observation.pending[0].reservation.bounds.rows = 1;
    observation.recipe.policy.maxSide = 5;
    const unused = builder.propose(0, 'unused')!;
    unused.spaces[0].origin.column = 10000;
    expect(builder.snapshot()).toEqual(before);
    const delta = builder.propose(0, 'committed')!;
    const replay = structuredClone(delta);
    builder.commit(delta);
    delta.spaces[0].origin.row = 10000;
    delta.pending.length = 0;
    const work = builder.work;
    work.index.queries = -1;
    expect(builder.work.index.queries).toBeGreaterThan(0);
    expect(builder.commit(replay).status).toBe('duplicate');
    expect(builder.finish()).toEqual(reference);
  });

  it('can finish after a valid caller request happens to use the next automatic request identity', () => {
    const recipe = recipeFor(2, 13);
    const builder = new ModuleAssembly(recipe);
    expect(builder.commit(builder.propose(0, 'expand-1')!).status).toBe('applied');
    expect(builder.finish()).toEqual(new ModuleAssembly(recipe).finish());
  });

  it('returns detached role centers so caller footprints cannot move assigned gameplay targets', () => {
    const state = new ModuleAssembly(recipeFor(2, 13)).finish();
    const source = footprints(state);
    const assigned = assignModuleRoles(source, state.joins, 2);
    const before = structuredClone(assigned);
    source[0].center.row += 1000;
    expect(assigned).toEqual(before);
  });

  it('keeps exit role identity stable when an equivalent room graph is enumerated in reverse edge order', () => {
    const state = new ModuleAssembly(recipeFor(2, 13)).finish();
    const source = footprints(state);
    const first = assignModuleRoles(source, state.joins, 2);
    const second = assignModuleRoles(source, [...state.joins].reverse(), 2);
    expect(second.map(room => [room.id, room.kind])).toEqual(first.map(room => [room.id, room.kind]));
  });

  it.each(BUDGETS)('qualifies each default-policy floor at %i rooms over 24 additional seeds', budget => {
    const measurements: { seed: number; coverage: number; forks: number; longestChain: number; depth: number;
      diameter: number; leaves: number; sideDepth: number; minimumFraction: number; projectionCells: number }[] = [];
    const failures: string[] = [];
    for (const seed of SEEDS) {
      try {
        const builder = new ModuleAssembly(recipeFor(seed, budget));
        const state = builder.finish();
        const quality = assertModuleQuality(state);
        verifyGeometry(state);
        const oracle = graphMetrics(state);
        for (const key of ['reachable', 'forks', 'leaves', 'depth', 'diameter'] as const) expect(quality[key]).toBe(oracle[key]);
        expect(state.pending).toHaveLength(0);
        expect(quality.projectionCells).toBeLessThanOrEqual(65_536);
        expect(quality.coverage).toBeGreaterThan(0.25);
        expect(quality.directJoins).toBeGreaterThan(0);
        expect(Math.max(...oracle.sideDepths)).toBeGreaterThanOrEqual(budget >= 12 ? 2 : 1);
        expect(builder.work.candidates).toBeLessThanOrEqual(4 * budget * state.recipe.policy.attempts);
        expect(builder.work.index.bucketReads).toBeLessThanOrEqual(builder.work.index.queries * 9);
        const assigned = assignModuleRoles(footprints(state), state.joins, seed);
        expect(assigned.filter(room => room.kind === 'ordinary')).toHaveLength(Math.max(0, budget - 8));
        for (const kind of ['start', 'hub', 'exit', 'boss']) expect(assigned.filter(room => room.kind === kind)).toHaveLength(1);
        const nonEntry = state.spaces.filter(space => space.kind === 'room' && space.id !== 'entry');
        measurements.push({ seed, coverage: quality.coverage, forks: quality.forks, longestChain: quality.longestChain,
          depth: quality.depth, diameter: quality.diameter, leaves: quality.leaves, sideDepth: Math.max(...oracle.sideDepths),
          minimumFraction: nonEntry.filter(space => space.rows === 5 && space.columns === 5).length / nonEntry.length,
          projectionCells: quality.projectionCells });
      } catch (error) { failures.push(`seed=${seed}, budget=${budget}: ${String(error)}`); }
    }
    console.info('D1_AUDIT_DEFAULT', JSON.stringify({ budget, completed: measurements.length, failures,
      medianCoverage: median(measurements.map(row => row.coverage)), medianForkFraction: median(measurements.map(row => row.forks / budget)),
      maxChain: Math.max(...measurements.map(row => row.longestChain)), maxProjectionCells: Math.max(...measurements.map(row => row.projectionCells)),
      depthRange: [Math.min(...measurements.map(row => row.depth)), Math.max(...measurements.map(row => row.depth))],
      diameterRange: [Math.min(...measurements.map(row => row.diameter)), Math.max(...measurements.map(row => row.diameter))],
      leafRange: [Math.min(...measurements.map(row => row.leaves)), Math.max(...measurements.map(row => row.leaves))],
      sideDepthRange: [Math.min(...measurements.map(row => row.sideDepth)), Math.max(...measurements.map(row => row.sideDepth))],
      maxMinimumFraction: Math.max(...measurements.map(row => row.minimumFraction)) }));
    expect(failures).toEqual([]);
    if (budget >= 32) expect(median(measurements.map(row => row.forks / budget))).toBeGreaterThanOrEqual(0.15);
  }, 60_000);

  it.each([
    { label: 'minimum-direct', policy: { minSide: 5, maxSide: 5, joins: 'direct', attempts: 32 } },
    { label: 'maximum-direct', policy: { minSide: 15, maxSide: 15, joins: 'direct', attempts: 32 } },
    { label: 'minimum-short-passage', policy: { minSide: 5, maxSide: 5, joins: 'passage', maxPassage: 1, attempts: 32 } },
    { label: 'maximum-passage', policy: { minSide: 15, maxSide: 15, joins: 'passage', maxPassage: 7, attempts: 32 } },
    { label: 'full-range-one-attempt', policy: { minSide: 5, maxSide: 15, joins: 'mixed', attempts: 1 } },
  ] satisfies { label: string; policy: Partial<ModulePolicy> }[])('measures bounded legal policy $label without hiding seed failures', ({ label, policy }) => {
    const failures: string[] = [];
    const completed: { seed: number; budget: number; forks: number; depth: number; coverage: number; projectionCells: number }[] = [];
    for (const budget of [7, 13, 32, 64]) for (const seed of SEEDS.slice(0, 12)) {
      try {
        const builder = new ModuleAssembly(recipeFor(seed, budget, policy));
        const state = builder.finish();
        const quality = assertModuleQuality(state);
        verifyGeometry(state);
        expect(quality.projectionCells).toBeLessThanOrEqual(65_536);
        expect(quality.coverage).toBeGreaterThan(0.25);
        if (policy.joins === 'direct') expect(quality.passages).toBe(0);
        if (policy.joins === 'passage') expect(quality.directJoins).toBe(0);
        completed.push({ seed, budget, forks: quality.forks, depth: quality.depth, coverage: quality.coverage, projectionCells: quality.projectionCells });
      } catch (error) { failures.push(`seed=${seed}, budget=${budget}: ${String(error)}`); }
    }
    console.info('D1_AUDIT_POLICY', JSON.stringify({ label, completed: completed.length, failures,
      minCoverage: Math.min(...completed.map(row => row.coverage)), maxProjectionCells: Math.max(...completed.map(row => row.projectionCells)),
      medianForkFractions: [32, 64].map(budget => ({ budget, fraction: median(completed.filter(row => row.budget === budget).map(row => row.forks / budget)) })) }));
    expect(failures).toEqual([]);
    for (const budget of [32, 64]) expect(median(completed.filter(row => row.budget === budget).map(row => row.forks / budget))).toBeGreaterThanOrEqual(0.15);
  }, 60_000);

  it('reports quality failure on complete but chain-shaped floors instead of accepting room count alone', () => {
    const state = new ModuleAssembly(recipeFor(2, 13)).finish();
    const rooms = state.spaces.filter(space => space.kind === 'room');
    state.joins = rooms.slice(1).map((room, index) => ({ id: `chain-${index}`, fromRoomId: rooms[index].id,
      toRoomId: room.id, direction: 'east' }));
    expect(moduleQuality(state)).toMatchObject({ rooms: 13, forks: 0, depth: 12, longestChain: 12, reachable: 13 });
    expect(() => assertModuleQuality(state)).toThrow(ModuleCapacityError);
    try { assertModuleQuality(state); } catch (error) { expect(error).toMatchObject({ reason: 'quality' }); }
  });

  it('fences module capacity before construction and qualifies the maximum-side one-attempt floor', () => {
    expect(() => new ModuleAssembly(recipeFor(0, 257))).toThrow(/257.*256/);
    const builder = new ModuleAssembly(recipeFor(0, 256, { minSide: 15, maxSide: 15, attempts: 1 }));
    const state = builder.finish();
    expect(builder.complete).toBe(true);
    verifyGeometry(state);
    const quality = assertModuleQuality(state);
    console.info('D1_AUDIT_PROJECTION_BOUNDARY', JSON.stringify({ seed: 0, budget: 256, projectionCells: quality.projectionCells,
      maxProjectionCells: 65_536, note: 'Assembler does not allocate projection cells; RPG projector must enforce this limit.' }));
  });

  it.each(['direct', 'passage', 'mixed'] as const)('preserves deterministic %s geometry under prefetch, retries and JSON transport', joins => {
    const recipe = recipeFor(0x80000000, 64, { joins });
    const builder = new ModuleAssembly(recipe);
    while (!builder.complete) {
      const before = builder.snapshot();
      const proposal = builder.propose(before.revision, `transport-${before.revision}`)!;
      expect(builder.propose(before.revision, proposal.requestId)).toEqual(proposal);
      builder.propose(before.revision, `unused-${before.revision}`);
      expect(builder.snapshot()).toEqual(before);
      expect(builder.commit(JSON.parse(JSON.stringify(proposal))).status).toBe('applied');
    }
    expect(builder.snapshot()).toEqual(new ModuleAssembly(recipe).finish());
  });

  it('rejects invalid role graphs without modifying input and assigns only one role to each stable room ID', () => {
    const state = new ModuleAssembly(recipeFor(2, 13)).finish();
    const rooms = footprints(state);
    const saved = structuredClone(rooms);
    expect(() => assignModuleRoles([rooms[0], rooms[0], ...rooms.slice(2)], state.joins, 2)).toThrow(/Duplicate/);
    expect(() => assignModuleRoles(rooms, [...state.joins, { fromRoomId: 'entry', toRoomId: 'missing' }], 2)).toThrow(/Dangling/);
    expect(() => assignModuleRoles(rooms, [], 2)).toThrow(/Disconnected/);
    const assigned = assignModuleRoles(rooms, state.joins, 2);
    expect(assigned.map(room => room.id)).toEqual(rooms.map(room => room.id));
    expect(rooms).toEqual(saved);
  });

  it('provides an actual small direct-floor map for shape review', () => {
    const state = new ModuleAssembly(recipeFor(2, 13, { minSide: 5, maxSide: 5, joins: 'direct' })).finish();
    const quality = assertModuleQuality(state);
    const rooms = state.spaces.filter(space => space.kind === 'room');
    const positions = new Map(rooms.map(room => [room.id,
      { row: (room.origin.row - quality.origin.row) / 5 * 2, column: (room.origin.column - quality.origin.column) / 5 * 2 }]));
    const rows = Array.from({ length: quality.rows / 5 * 2 - 1 }, () => Array<string>(quality.columns / 5 * 2 - 1).fill(' '));
    for (const [index, room] of rooms.entries()) {
      const { row, column } = positions.get(room.id)!;
      rows[row][column] = index === 0 ? 'S' : String.fromCharCode(64 + index);
    }
    for (const join of state.joins) {
      const from = positions.get(join.fromRoomId)!;
      const to = positions.get(join.toRoomId)!;
      rows[(from.row + to.row) / 2][(from.column + to.column) / 2] = from.row === to.row ? '-' : '|';
    }
    console.info('D1_AUDIT_MAP seed=2 budget=13 minSide=maxSide=5 direct; each letter is an actual 5x5 room; links are actual doors\n'
      + rows.map(row => row.join('').trimEnd()).join('\n'));
    verifyGeometry(state);
  });

  it('audits another 128 default seeds at 256 rooms within a bounded cohort', () => {
    const failures: string[] = [];
    const projections: number[] = [];
    const coverages: number[] = [];
    for (let index = 0; index < 128; index++) {
      const seed = Math.imul(index + 1, 2654435761) >>> 0;
      try {
        const builder = new ModuleAssembly(recipeFor(seed, 256));
        const state = builder.finish();
        const quality = assertModuleQuality(state);
        expect(quality.projectionCells).toBeLessThanOrEqual(65_536);
        expect(quality.coverage).toBeGreaterThan(0.25);
        expect(quality.directJoins).toBeGreaterThan(0);
        expect(state.rooms).toBe(256);
        projections.push(quality.projectionCells);
        coverages.push(quality.coverage);
      } catch (error) { failures.push(`seed=${seed}, budget=256: ${String(error)}`); }
    }
    console.info('D1_AUDIT_STRESS', JSON.stringify({ completed: projections.length, failures,
      maxProjectionCells: Math.max(...projections), minimumCoverage: Math.min(...coverages) }));
    expect(failures).toEqual([]);
  }, 60_000);
});
