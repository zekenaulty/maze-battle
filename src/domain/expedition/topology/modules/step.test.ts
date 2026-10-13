import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { SpaceSpec } from '../../types';
import { OccupancyIndex } from '../occupancy';
import { keyedSeed } from '../seed';
import type { Bounds } from '../types';
import { ModuleAssembly } from './assembly';
import { moduleSpace, spaceOccupancy, type OccupancyQuery } from './placement';
import { createModuleRecipe, type ModulePolicy, type ModuleRecipe } from './policy';
import { bootstrapModule, proposeModuleStep, type ModuleStepState } from './step';
import type { ModuleAssemblyState, ModuleSocket } from './types';

// SHA-256 of initial snapshot, every proposal and post-commit snapshot, then work.
// Captured from unmodified assembly.ts at d54c418ccff516d7ac3d4961d0327060a629364f.
const baselineHashes = [
  '31d77471e708c074dc00f289a2942d7f78494a7477c550166764038ba5c70d97',
  '75197f7150eb48642a031fdaa24443adb1ea98fa7de47cfc4a263b5bba2f8d7b',
  '106447eb7eb1a3aff624ae1468cb78fe294f16d48fd4e8246633a8c044826e83',
  'f449cbe5d420f136e687ffbb2e0ce188f5d290fcb1a4b4e1a51ee6f2808e10b6',
  'ec8dcc04a842d74ed72e6574207c5cb2b7477b12e00c3c520a4a12746e7b7f5d',
  '96bbb8637601387ef759baf358d0e31801089ce71c235f6fb818e5a6e4a31473',
  '57082481983f3e523fc1d3589d19bc3bd8765a81dc27e6b654dc8369cc21b517',
  'cf53818486a146d279c155f053412f171d686562d37cddf4e1486734865ba39f',
  'b50ebc6df26ffddab5ad5f8555f5547e2b3930de1f04f8c9ea4a0bfb50e27f07',
];
const fixtures = (['direct', 'passage', 'mixed'] as const).flatMap(joins =>
  [{ seed: 0, level: 1 }, { seed: 42, level: 5 }, { seed: 0xffffffff, level: 29 }]
    .map(value => ({ ...value, joins }))).map((value, index) => ({ ...value, hash: baselineHashes[index] }));

function recipeFor(seed = 42, level = 5, policy: Partial<ModulePolicy> = {}): ModuleRecipe {
  const recipe = createModuleRecipe('module-step-baseline', level, seed);
  return { ...recipe, policy: { ...recipe.policy, ...policy } };
}

function fixture(policy: Partial<ModulePolicy> = {}) {
  const initial = bootstrapModule(recipeFor(42, 5, policy));
  return { state: initial.state, socket: initial.pending[0], source: initial.space };
}

function freeze(value: object) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  Object.freeze(value);
}

function aggregate(recipe: ModuleRecipe): string {
  const initial = bootstrapModule(recipe);
  let state = initial.state;
  let all: ModuleAssemblyState = { recipe: state.recipe, scopeId: state.scopeId, revision: 0, rooms: 1,
    nextSequence: state.nextSequence, spaces: [initial.space], joins: [], connections: [], pending: initial.pending };
  const index = new OccupancyIndex();
  for (const entry of initial.occupancy) index.add(entry);
  const work = { ...initial.work };
  const builder = new ModuleAssembly(recipe, { maxModules: recipe.roomBudget, maxProjectionCells: 65_536 });
  const hash = createHash('sha256').update(JSON.stringify(all));
  expect(JSON.stringify(all)).toBe(JSON.stringify(builder.snapshot()));
  while (state.rooms < recipe.roomBudget) {
    const socket = all.pending[0];
    const source = all.spaces.find(space => space.id === socket.sourceId)!;
    const occupied = (bounds: Bounds, except?: string) => index.occupied(bounds, except);
    const delta = proposeModuleStep(state, socket, source, occupied, `step-${state.revision}`);
    const expected = builder.propose(state.revision, delta.requestId)!;
    expect(JSON.stringify(delta)).toBe(JSON.stringify(expected));
    // Match the assembler's proposal plus commit-time revalidation index work.
    expect(proposeModuleStep(state, socket, source, occupied, delta.requestId)).toEqual(delta);
    hash.update(JSON.stringify(delta));
    index.remove(delta.resolved);
    for (const space of delta.spaces) index.add(spaceOccupancy(space));
    for (const pending of delta.pending) index.add(pending.reservation);
    state = { ...state, revision: state.revision + 1, rooms: state.rooms + 1,
      nextSequence: state.nextSequence + delta.pending.length, pendingCount: state.pendingCount - 1 + delta.pending.length };
    all = { ...all, revision: state.revision, rooms: state.rooms, nextSequence: state.nextSequence,
      spaces: [...all.spaces, ...delta.spaces], joins: [...all.joins, delta.join],
      connections: [...all.connections, ...delta.connections], pending: [...all.pending.slice(1), ...delta.pending] };
    for (const key of ['candidates', 'occupancyQueries', 'localChecks'] as const) work[key] += delta.work[key];
    builder.commit(expected);
    expect(JSON.stringify(all)).toBe(JSON.stringify(builder.snapshot()));
    expect(state.pendingCount).toBe(all.pending.length);
    expect(state.nextSequence).toBe(state.revision + state.pendingCount);
    expect(delta.pending.every(pending => pending.sourceId === socket.room.id)).toBe(true);
    hash.update(JSON.stringify(all));
  }
  const totalWork = { ...work, index: { ...index.work } };
  expect(totalWork).toEqual(builder.work);
  expect(all.pending).toEqual([]);
  return hash.update(JSON.stringify(totalWork)).digest('hex');
}

describe('incremental module extraction', () => {
  it.each(fixtures)('matches the old $joins transcript at seed=$seed, level=$level', ({ seed, level, joins, hash }) => {
    expect(aggregate(recipeFor(seed, level, { joins }))).toBe(hash);
  });

  it.each([
    { minSide: 5, maxSide: 5, joins: 'direct', attempts: 32 },
    { minSide: 15, maxSide: 15, joins: 'direct', attempts: 32 },
    { minSide: 5, maxSide: 5, joins: 'passage', maxPassage: 1 },
    { minSide: 15, maxSide: 15, joins: 'passage', maxPassage: 7 },
    { joins: 'mixed', attempts: 1 },
  ] satisfies Partial<ModulePolicy>[])('agrees at policy boundaries: %j', policy => {
    aggregate(recipeFor(7, 5, policy));
  });

  it('preserves the minimum room budget and quota-zero final expansion', () => {
    aggregate({ ...recipeFor(), roomBudget: 3 });
    const { state, socket, source } = fixture();
    state.recipe.roomBudget = state.rooms + state.pendingCount;
    state.scopeId = JSON.stringify(state.recipe);
    const occupied = vi.fn(() => false);
    const delta = proposeModuleStep(state, socket, source, occupied, 'no-quota');
    expect(delta.pending).toEqual([]);
    expect(delta.spaces[0]).toEqual(socket.room);
    expect(delta.work).toEqual({ candidates: 0, occupancyQueries: 0, localChecks: 0 });
    expect(occupied).not.toHaveBeenCalled();
  });

  it('owns bootstrap recipe data and produces detached, repeatable proposals without changing inputs', () => {
    const recipe = recipeFor();
    const initial = bootstrapModule(recipe);
    const saved = structuredClone(initial);
    recipe.policy.joins = 'direct';
    recipe.seed = 0;
    expect(initial).toEqual(saved);
    freeze(initial);
    const { state, pending, space } = initial;
    const delta = proposeModuleStep(state, pending[0], space, () => false, 'pure');
    const before = structuredClone(delta);
    delta.spaces[0].origin.row += 100;
    delta.pending.length = 0;
    delta.work.candidates = -1;
    expect(initial).toEqual(saved);
    expect(proposeModuleStep(state, pending[0], space, () => false, 'pure')).toEqual(before);
  });

  it('bounds bootstrap and one-step work independently of the room budget, without a new size cap', () => {
    for (const roomBudget of [257, 1_000_000, Number.MAX_SAFE_INTEGER]) {
      const recipe = { ...recipeFor(), roomBudget };
      const initial = bootstrapModule(recipe);
      expect(Object.keys(initial.state)).toEqual(['recipe', 'scopeId', 'revision', 'rooms', 'nextSequence', 'pendingCount']);
      expect(initial.pending.length).toBeLessThanOrEqual(4);
      expect(initial.occupancy).toEqual([spaceOccupancy(initial.space), ...initial.pending.map(socket => socket.reservation)]);
      expect(initial.work.candidates).toBeLessThanOrEqual(4 * recipe.policy.attempts);
      expect(initial.work.localChecks).toBeLessThanOrEqual(initial.work.candidates * 4);
      const { state, space, pending } = initial;
      const occupied = vi.fn<OccupancyQuery>(() => true);
      const delta = proposeModuleStep(state, pending[0], space, occupied, 'blocked');
      expect(delta.pending).toEqual([]);
      expect(delta.spaces).toEqual([pending[0].room, ...(pending[0].passage ? [pending[0].passage] : [])]);
      expect(delta.work.candidates).toBe(3 * recipe.policy.attempts);
      expect(delta.work.occupancyQueries).toBe(occupied.mock.calls.length);
      expect(delta.work.occupancyQueries).toBeLessThanOrEqual(delta.work.candidates);
      expect(delta.work.localChecks).toBeLessThanOrEqual(delta.work.candidates * 4);
      expect(occupied.mock.calls.every(([, except]) => except === pending[0].id)).toBe(true);
    }
    aggregate({ ...recipeFor(), roomBudget: 257 });
  });

  it('uses safe sequence arithmetic near the integer boundary without scanning earlier sockets', () => {
    const { state, socket, source } = fixture({ joins: 'direct' });
    state.recipe.roomBudget = Number.MAX_SAFE_INTEGER;
    state.scopeId = JSON.stringify(state.recipe);
    state.rooms = Number.MAX_SAFE_INTEGER - 4;
    state.revision = state.rooms - 1;
    state.pendingCount = 1;
    state.nextSequence = state.revision + 1;
    source.id = `socket-${state.revision - 1}:room`;
    source.seed = keyedSeed(state.recipe.seed, source.id);
    socket.sourceId = source.id;
    socket.id = `socket-${state.revision}`;
    socket.reservation.id = socket.id;
    socket.room.id = `${socket.id}:room`;
    socket.room.seed = keyedSeed(state.recipe.seed, socket.room.id);
    const delta = proposeModuleStep(state, socket, source, () => false, 'large-counters');
    expect(delta.pending.length).toBeGreaterThan(0);
    expect(delta.pending.length).toBeLessThanOrEqual(3);
    expect(delta.pending.map((_, offset) => `socket-${state.nextSequence + offset}`)).toEqual(delta.pending.map(value => value.id));
    expect(Number.isSafeInteger(state.nextSequence + delta.pending.length)).toBe(true);
  });

  it('propagates occupancy failures without changing the inputs', () => {
    const input = fixture();
    const before = structuredClone(input);
    const failure = new Error('occupancy unavailable');
    expect(() => proposeModuleStep(input.state, input.socket, input.source, () => { throw failure; }, 'failure')).toThrow(failure);
    expect(input).toEqual(before);
  });
});

describe('module step validation', () => {
  type Input = { state: ModuleStepState; socket: ModuleSocket; source: SpaceSpec };
  const invalid: [string, (value: Input) => void][] = [
    ['scope', value => { value.state.scopeId = 'other'; }],
    ['recipe scope drift', value => { value.state.recipe.seed++; }],
    ['fractional revision', value => { value.state.revision = 0.5; }],
    ['negative revision', value => { value.state.revision = -1; }],
    ['unsafe revision', value => { value.state.revision = Number.MAX_SAFE_INTEGER + 1; }],
    ['rooms/revision mismatch', value => { value.state.rooms++; }],
    ['missing rooms', value => { value.state.rooms = 0; }],
    ['complete state', value => { value.state.rooms = value.state.recipe.roomBudget; value.state.revision = value.state.rooms - 1; }],
    ['no pending socket', value => { value.state.pendingCount = 0; }],
    ['fractional pending count', value => { value.state.pendingCount = 1.5; }],
    ['over-reserved budget', value => { value.state.pendingCount = value.state.recipe.roomBudget; }],
    ['unsafe pending count', value => { value.state.pendingCount = Number.MAX_SAFE_INTEGER + 1; }],
    ['sequence mismatch', value => { value.state.nextSequence++; }],
    ['unsafe sequence', value => { value.state.nextSequence = Number.MAX_SAFE_INTEGER + 1; }],
    ['out-of-order socket', value => { value.socket.id = 'socket-1'; }],
    ['foreign source', value => { value.socket.sourceId = 'other'; }],
    ['future source', value => { value.source.id = value.socket.sourceId = 'socket-0:room'; }],
    ['unsafe source sequence', value => { value.source.id = value.socket.sourceId = 'socket-9007199254740992:room'; }],
    ['invalid direction', value => { value.socket.direction = 'up' as ModuleSocket['direction']; }],
    ['room identity', value => { value.socket.room.id = 'other'; }],
    ['room kind', value => { value.socket.room.kind = 'passage'; }],
    ['room seed', value => { value.socket.room.seed++; }],
    ['room dimension', value => { value.socket.room.rows++; }],
    ['room alignment', value => { value.socket.room.origin.row++; }],
    ['room coordinate', value => { value.socket.room.origin.row = NaN; }],
    ['room endpoint overflow', value => { value.socket.room.origin.column = Number.MAX_SAFE_INTEGER; }],
    ['source endpoint overflow', value => { value.source.origin.row = Number.MAX_SAFE_INTEGER; }],
    ['source seed', value => { value.source.seed++; }],
    ['entry geometry', value => { value.source.origin.column++; }],
    ['reservation identity', value => { value.socket.reservation.id = 'other'; }],
    ['reservation kind', value => { value.socket.reservation.kind = 'space'; }],
    ['reservation extent', value => { value.socket.reservation.bounds.rows++; }],
    ['reservation coordinate', value => { value.socket.reservation.bounds.row += 0.5; }],
    ['reservation endpoint overflow', value => { value.socket.reservation.bounds.row = Number.MAX_SAFE_INTEGER; }],
    ['unbounded contents', value => { value.socket.room.chests = [{ id: 'chest', cell: { row: 1, column: 1 } }]; }],
  ];

  it.each(invalid)('rejects %s before querying occupancy', (_, mutate) => {
    const input = fixture();
    mutate(input);
    const before = structuredClone(input);
    const occupied = vi.fn(() => false);
    expect(() => proposeModuleStep(input.state, input.socket, input.source, occupied, 'invalid')).toThrow();
    expect(input).toEqual(before);
    expect(occupied).not.toHaveBeenCalled();
  });

  it.each([
    ['identity', (socket: ModuleSocket) => { socket.passage!.id = 'other'; }],
    ['alignment', (socket: ModuleSocket) => { socket.passage!.origin.row++; }],
    ['dimensions', (socket: ModuleSocket) => { socket.passage!.columns++; }],
    ['omitted passage', (socket: ModuleSocket) => { delete socket.passage; }],
  ] as const)('rejects invalid passage %s', (_, mutate) => {
    const { state, socket, source } = fixture({ joins: 'passage' });
    mutate(socket);
    const occupied = vi.fn(() => false);
    expect(() => proposeModuleStep(state, socket, source, occupied, 'invalid')).toThrow();
    expect(occupied).not.toHaveBeenCalled();
  });

  it.each(['', ' ', 'x'.repeat(129), null, 1])('rejects invalid request identity %j', requestId => {
    const { state, socket, source } = fixture();
    const occupied = vi.fn(() => false);
    expect(() => proposeModuleStep(state, socket, source, occupied, requestId as string)).toThrow(/request identity/);
    expect(occupied).not.toHaveBeenCalled();
  });

  it.each([NaN, Infinity, -1, 2, 3.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid bootstrap budget %j', roomBudget => {
    expect(() => bootstrapModule({ ...recipeFor(), roomBudget })).toThrow(/room budget/);
  });

  it('rejects missing state, socket, source, query and invalid recipes', () => {
    const { state, socket, source } = fixture();
    expect(() => bootstrapModule(undefined!)).toThrow();
    expect(() => bootstrapModule({ ...recipeFor(), seed: -1 })).toThrow();
    expect(() => bootstrapModule(recipeFor(42, 5, { attempts: 33 }))).toThrow();
    expect(() => proposeModuleStep(undefined!, socket, source, () => false, 'missing')).toThrow();
    expect(() => proposeModuleStep(state, undefined!, source, () => false, 'missing')).toThrow();
    expect(() => proposeModuleStep(state, socket, undefined!, () => false, 'missing')).toThrow();
    expect(() => proposeModuleStep(state, socket, source, undefined!, 'missing')).toThrow();
  });

  it.each(['east', 'west'] as const)('rejects generated %s coordinate overflow before querying unsafe bounds', direction => {
    const recipe = recipeFor(42, 5, { joins: 'direct', minSide: 5, maxSide: 5 });
    const state: ModuleStepState = { recipe, scopeId: JSON.stringify(recipe), revision: 1, rooms: 2, nextSequence: 2, pendingCount: 1 };
    const column = direction === 'east' ? Number.MAX_SAFE_INTEGER - 14 : -Number.MAX_SAFE_INTEGER + 9;
    const source = moduleSpace('socket-0:room', 'room', { row: 0, column, rows: 5, columns: 5 }, keyedSeed(recipe.seed, 'socket-0:room'));
    const room = moduleSpace('socket-1:room', 'room', { row: 0, column: column + (direction === 'east' ? 5 : -5), rows: 5, columns: 5 },
      keyedSeed(recipe.seed, 'socket-1:room'));
    const socket: ModuleSocket = { id: 'socket-1', sourceId: source.id, direction, room,
      reservation: { ...spaceOccupancy(room), id: 'socket-1', kind: 'reservation' } };
    const before = structuredClone({ state, source, socket });
    const occupied = vi.fn<OccupancyQuery>(() => true);
    expect(() => proposeModuleStep(state, socket, source, occupied, 'overflow')).toThrow(/geometry integers/);
    expect(occupied.mock.calls.every(([bounds]) => [bounds.row, bounds.column, bounds.row + bounds.rows,
      bounds.column + bounds.columns].every(Number.isSafeInteger))).toBe(true);
    expect({ state, source, socket }).toEqual(before);
  });
});
