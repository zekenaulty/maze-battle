import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { Direction, GridPosition, MazeCellState } from '../types';
import { cellKey, samePosition } from '../maze/key';
import { movePosition, opposite } from '../maze/movement';
import { createExpeditionPlan, materializeSpace } from './generation';
import type { CellAddress, ExpeditionPlan, ExpeditionRecipe, SpaceGeometry, SpaceSpec } from './types';

const RECIPE: ExpeditionRecipe = { version: 'spaces-v1', worldId: 'fixture', floorId: 'floor-1', level: 1, seed: 0 };
const SEEDS = [0, 1, 0x7fffffff, 0x80000000, 0xffffffff,
  ...Array.from({ length: 19 }, (_, index) => Math.imul(index + 1, 2654435761) >>> 0)];
const LEVELS = [1, 3, 4, 7, 13, Number.MAX_SAFE_INTEGER];
const CASES = SEEDS.flatMap((seed) => LEVELS.map((level) => ({ seed, level })));
const addressKey = (cell: CellAddress) => `${cell.spaceId}:${cellKey(cell)}`;
const globalCell = (space: SpaceSpec, cell: GridPosition) =>
  ({ row: space.origin.row + cell.row, column: space.origin.column + cell.column });

describe('bounded spaces-v1 fixture properties', () => {
  it.each(CASES)('connects and embeds seed=$seed level=$level', ({ seed, level }) => {
    const plan = createExpeditionPlan({ ...RECIPE, seed, level });
    const geometries = plan.spaces.map(materializeSpace);
    const rooms = plan.spaces.filter((space) => space.kind === 'room');
    expect(rooms).toHaveLength(6);
    expect(plan.spaces.length).toBeLessThanOrEqual(24);
    expect(plan.spaces.filter((space) => space.kind === 'passage')).toHaveLength(5);
    expect(new Set(plan.spaces.map((space) => space.id)).size).toBe(plan.spaces.length);
    expect(new Set(rooms.map((room) => room.rows)).size).toBeGreaterThan(1);
    expect(new Set(rooms.map((room) => `${room.rows}:${room.columns}`)).size).toBeGreaterThan(1);
    expect(new Set(rooms.map((room) => room.seed & 3)).size).toBe(3);
    expect(rooms.some((room) => room.openings.length >= 3)).toBe(true);
    const entry = plan.spaces.find((space) => space.id === plan.start.spaceId)!;
    expect(entry.kind).toBe('room');
    expect(plan.start.row).toBeGreaterThan(0);
    expect(plan.start.column).toBeGreaterThan(0);
    expect(plan.start.row).toBeLessThan(entry.rows - 1);
    expect(plan.start.column).toBeLessThan(entry.columns - 1);
    expect(entry.openings.some((opening) => samePosition(opening.cell, plan.start))).toBe(false);

    geometries.forEach((geometry, index) => checkGeometry(plan.spaces[index], geometry));
    checkPlacement(plan);
    checkOpenings(plan, geometries);
    checkReachability(plan, geometries);
  });

  it.each(CASES)('materializes independently of order seed=$seed level=$level', ({ seed, level }) => {
    const recipe = { ...RECIPE, seed, level };
    const plan = createExpeditionPlan(recipe);
    const original = JSON.stringify(plan);
    freeze(plan);
    const forward = new Map(plan.spaces.map((space) => [space.id, materializeSpace(space)]));
    const interleaved = [...plan.spaces.filter((_, i) => i % 2), ...plan.spaces.filter((_, i) => !(i % 2))];
    for (const order of [[...plan.spaces].reverse(), interleaved]) {
      for (const spec of order) expect(materializeSpace(spec)).toEqual(forward.get(spec.id));
    }
    expect(createExpeditionPlan(recipe)).toEqual(plan);
    expect(JSON.stringify(plan)).toBe(original);
  });

  it('pins the versioned plan and geometry, without global randomness', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Global randomness'); });
    try {
      const plan = createExpeditionPlan(RECIPE);
      const digest = createHash('sha256').update(JSON.stringify([plan, plan.spaces.map(materializeSpace)])).digest('hex');
      expect(digest).toBe('07859571fdeb3eab26a2212dd7a3b18106053105719b939369fb2fa655354c55');
    } finally {
      random.mockRestore();
    }
  });

  it('varies seed and level within caps, retaining the exact recipe and scope identity', () => {
    const original = createExpeditionPlan(RECIPE);
    for (const patch of [{ seed: 1 }, { level: 4 }, { worldId: 'other' }, { floorId: 'other' }]) {
      expect(createExpeditionPlan({ ...RECIPE, ...patch }).scopeId).not.toBe(original.scopeId);
    }
    expect(createExpeditionPlan({ ...RECIPE, seed: 1 }).spaces).not.toEqual(original.spaces);
    expect(createExpeditionPlan({ ...RECIPE, level: 4 }).spaces).not.toEqual(original.spaces);
    const recipe = { ...RECIPE };
    const plan = createExpeditionPlan(recipe);
    recipe.seed = 100;
    expect(plan.recipe.seed).toBe(0);
    expect(createExpeditionPlan({ ...RECIPE, level: Number.MAX_SAFE_INTEGER }).spaces)
      .toEqual(createExpeditionPlan({ ...RECIPE, level: 13 }).spaces);
    expect(createExpeditionPlan({ ...RECIPE, worldId: 'a:b', floorId: 'c' }).scopeId)
      .not.toBe(createExpeditionPlan({ ...RECIPE, worldId: 'a', floorId: 'b:c' }).scopeId);
  });

  it('returns fresh mutable geometry without retaining shared state', () => {
    const spec = createExpeditionPlan(RECIPE).spaces[0];
    const expected = materializeSpace(spec);
    const changed = materializeSpace(spec);
    changed.cells[0].links.length = 0;
    changed.cells.pop();
    expect(materializeSpace(spec)).toEqual(expected);
    expect(materializeSpace(JSON.parse(JSON.stringify(spec)))).toEqual(expected);
  });
});

function checkGeometry(spec: SpaceSpec, geometry: SpaceGeometry) {
  expect(geometry.spaceId).toBe(spec.id);
  expect([geometry.rows, geometry.columns]).toEqual([spec.rows, spec.columns]);
  expect(spec.rows * spec.columns).toBeLessThanOrEqual(512);
  expect(geometry.cells.length).toBeLessThanOrEqual(512);
  if (spec.kind === 'room') expect(geometry.cells.length).toBeLessThan(spec.rows * spec.columns);
  const cells = new Map(geometry.cells.map((cell) => [cellKey(cell), cell]));
  expect(cells.size).toBe(geometry.cells.length);
  const invalid: MazeCellState[] = [];
  for (const cell of geometry.cells) {
    if (cell.row < 0 || cell.column < 0 || cell.row >= spec.rows || cell.column >= spec.columns ||
      !cell.links.length || new Set(cell.links).size !== cell.links.length ||
      cell.links.some((direction) => !cells.get(cellKey(movePosition(cell, direction)))?.links.includes(opposite(direction)))) {
      invalid.push(cell);
    }
  }
  expect(invalid).toEqual([]);
  const reached = new Set<string>();
  const queue = [geometry.cells[0]];
  for (let index = 0; index < queue.length; index++) {
    const cell = queue[index];
    if (reached.has(cellKey(cell))) continue;
    reached.add(cellKey(cell));
    queue.push(...cell.links.map((direction) => cells.get(cellKey(movePosition(cell, direction)))!));
  }
  expect(reached.size).toBe(geometry.cells.length);
}

function checkPlacement(plan: ExpeditionPlan) {
  const occupied = new Set<string>();
  let area = 0;
  for (const space of plan.spaces) {
    // Check complete bounding boxes, not just walkable cells, for overlap.
    for (let row = 0; row < space.rows; row++) {
      for (let column = 0; column < space.columns; column++) {
        occupied.add(cellKey(globalCell(space, { row, column })));
        area++;
      }
    }
  }
  expect(occupied.size).toBe(area);
}

function checkOpenings(plan: ExpeditionPlan, geometries: SpaceGeometry[]) {
  const spaces = new Map(plan.spaces.map((space) => [space.id, space]));
  const floors = new Map(geometries.map((geometry) => [geometry.spaceId, new Set(geometry.cells.map(cellKey))]));
  const openings = plan.spaces.flatMap((space) => space.openings);
  expect(new Set(openings.map((opening) => opening.id)).size).toBe(openings.length);
  expect(openings).toHaveLength(20);
  for (const space of plan.spaces) {
    for (const opening of space.openings) {
      const destination = spaces.get(opening.destination.spaceId)!;
      expect(destination).toBeDefined();
      expect(floors.get(space.id)!.has(cellKey(opening.cell))).toBe(true);
      expect(floors.get(destination.id)!.has(cellKey(opening.destination))).toBe(true);
      const outside = movePosition(opening.cell, opening.direction);
      expect(outside.row < 0 || outside.column < 0 || outside.row >= space.rows || outside.column >= space.columns).toBe(true);
      const reciprocal = destination.openings.filter((other) =>
        samePosition(other.cell, opening.destination) && other.direction === opposite(opening.direction) &&
        other.destination.spaceId === space.id && samePosition(other.destination, opening.cell));
      expect(reciprocal).toHaveLength(1);
      expect(reciprocal[0].id).not.toBe(opening.id);
      expect(movePosition(globalCell(space, opening.cell), opening.direction))
        .toEqual(globalCell(destination, opening.destination));
    }
  }
}

function checkReachability(plan: ExpeditionPlan, geometries: SpaceGeometry[]) {
  const cells = new Map(geometries.flatMap((geometry) => geometry.cells.map((cell) =>
    [addressKey({ spaceId: geometry.spaceId, ...cell }), cell] as const)));
  const spaces = new Map(plan.spaces.map((space) => [space.id, space]));
  const reached = new Set<string>();
  const queue: CellAddress[] = [plan.start];
  for (let index = 0; index < queue.length; index++) {
    const address = queue[index];
    if (reached.has(addressKey(address))) continue;
    reached.add(addressKey(address));
    queue.push(...cells.get(addressKey(address))!.links.map((direction) =>
      ({ spaceId: address.spaceId, ...movePosition(address, direction) })));
    queue.push(...spaces.get(address.spaceId)!.openings.filter((opening) => samePosition(opening.cell, address))
      .map((opening) => opening.destination));
  }
  expect(reached.size).toBe(cells.size);
  const chests = plan.spaces.flatMap((space) => space.chests);
  expect(chests.length).toBeGreaterThan(0);
  expect(new Set(chests.map((chest) => chest.id)).size).toBe(chests.length);
  for (const space of plan.spaces) {
    for (const chest of space.chests) {
      expect(reached.has(addressKey({ spaceId: space.id, ...chest.cell }))).toBe(true);
      expect(space.openings.some((opening) => samePosition(opening.cell, chest.cell))).toBe(false);
    }
  }
}

function freeze(value: object) {
  Object.freeze(value);
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
}

describe('input and work bounds', () => {
  it.each([-1, 1.5, NaN, Infinity, -Infinity, 0x100000000, Number.MAX_SAFE_INTEGER])('rejects seed %s', (seed) => {
    expect(() => createExpeditionPlan({ ...RECIPE, seed })).toThrow(/seed/i);
    expect(() => materializeSpace({ ...createExpeditionPlan(RECIPE).spaces[0], seed })).toThrow(/seed/i);
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects level %s', (level) => {
    expect(() => createExpeditionPlan({ ...RECIPE, level })).toThrow(/level/i);
  });

  it('rejects unknown versions, missing recipe and invalid identity', () => {
    expect(() => createExpeditionPlan({ ...RECIPE, version: 'spaces-v2' } as unknown as ExpeditionRecipe)).toThrow(/version/i);
    expect(() => createExpeditionPlan(null as unknown as ExpeditionRecipe)).toThrow();
    for (const id of ['', ' ', 'x'.repeat(129)]) {
      expect(() => createExpeditionPlan({ ...RECIPE, worldId: id })).toThrow();
      expect(() => createExpeditionPlan({ ...RECIPE, floorId: id })).toThrow();
    }
  });

  it.each([[0, 7], [-1, 7], [7, 0], [1.5, 7], [7, 1.5], [NaN, 7], [7, Infinity], [513, 1], [1, 513], [23, 23]])
    ('rejects dimensions %s x %s before allocation', (rows, columns) => {
      expect(() => materializeSpace({ ...bareSpace(), rows, columns })).toThrow(/dimensions/i);
    });

  it.each([[1, 512], [512, 1], [16, 32]])('accepts exactly 512 cells (%s x %s)', (rows, columns) => {
    expect(materializeSpace({ ...bareSpace(), kind: 'passage', rows, columns }).cells).toHaveLength(512);
  });

  it('bounds metadata work and validates coordinates', () => {
    const spec = bareSpace();
    expect(() => materializeSpace({ ...spec, openings: new Array(10000) })).toThrow(/work/i);
    expect(() => materializeSpace({ ...spec, chests: new Array(10000) })).toThrow(/work/i);
    for (const origin of [{ row: NaN, column: 0 }, { row: 0, column: 0.5 }, { row: Number.MAX_SAFE_INTEGER, column: 0 }]) {
      expect(() => materializeSpace({ ...spec, origin })).toThrow(/origin/i);
    }
    expect(() => materializeSpace({ ...spec, rows: 2, origin: { row: Number.MAX_SAFE_INTEGER, column: 0 } })).toThrow(/origin/i);
    expect(() => materializeSpace({ ...spec, origin: { row: -100, column: -100 } })).not.toThrow();
  });

  it('rejects inward, duplicate, out-of-range and self-referencing openings', () => {
    const spec = bareSpace();
    const opening = { id: 'port', cell: { row: 0, column: 3 }, direction: 'north' as Direction,
      destination: { spaceId: 'other', row: 6, column: 3 } };
    for (const patch of [
      { direction: 'south' as Direction }, { direction: 'up' as Direction }, { cell: { row: 1, column: 3 } },
      { cell: { row: -1, column: 3 } }, { destination: { ...opening.destination, spaceId: spec.id } },
      { destination: { ...opening.destination, row: 512 } }, { destination: { ...opening.destination, row: 1.5 } },
    ]) expect(() => materializeSpace({ ...spec, openings: [{ ...opening, ...patch }] })).toThrow(/opening/i);
    expect(() => materializeSpace({ ...spec, openings: [opening, opening] })).toThrow(/opening/i);
    expect(() => materializeSpace({ ...spec, openings: [opening, { ...opening, id: 'other-port' }] })).toThrow(/port/i);
    expect(() => materializeSpace({ ...spec, openings: [opening] })).not.toThrow();
  });

  it('rejects unreachable, duplicate, out-of-bounds and opening chests', () => {
    const spec = bareSpace();
    const chest = { id: 'chest', cell: { row: 1, column: 1 } };
    for (const cell of [{ row: 2, column: 2 }, { row: -1, column: 0 }, { row: 7, column: 0 }]) {
      expect(() => materializeSpace({ ...spec, chests: [{ ...chest, cell }] })).toThrow(/chest/i);
    }
    expect(() => materializeSpace({ ...spec, chests: [chest, chest] })).toThrow(/chest/i);
    expect(() => materializeSpace({ ...spec, chests: [chest, { ...chest, id: 'other' }] })).toThrow(/chest/i);
    const cell = { row: 0, column: 3 };
    expect(() => materializeSpace({ ...spec, chests: [{ ...chest, cell }], openings: [{
      id: 'port', cell, direction: 'north', destination: { spaceId: 'other', row: 6, column: 3 },
    }] })).toThrow(/chest/i);
  });
});

function bareSpace(): SpaceSpec {
  return { id: 'test', kind: 'room', name: 'Test', seed: 0, rows: 7, columns: 7,
    origin: { row: 0, column: 0 }, openings: [], chests: [] };
}
