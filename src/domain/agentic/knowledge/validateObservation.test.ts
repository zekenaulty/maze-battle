import { describe, expect, it, vi } from 'vitest';
import { chestAt, roomAt } from '../../automation/autopilotTestFixtures';
import { createModuleRecipe } from '../../expedition/topology/modules/policy';
import { generateModuleMaze } from '../../maze/moduleGenerate';
import { address, fixture, identity, observed } from './fixtures.test-support';
import { observeRpg } from './observe';
import type { RpgObservation } from './types';
import { validateRpgObservation } from './validateObservation';

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
type Receipt = Mutable<RpgObservation>;
const mutable = (game = fixture()): Receipt => JSON.parse(JSON.stringify(observed(game)));

function at(value: unknown, path: string): Record<string, unknown> {
  return (path ? path.split('.').reduce<unknown>((current, key) => (current as Record<string, unknown>)[key], value)
    : value) as Record<string, unknown>;
}

function replace(value: unknown, path: string, replacement: unknown) {
  const keys = path.split('.');
  const key = keys.pop()!;
  at(value, keys.join('.'))[key] = replacement;
}

function objects(value: unknown): object[] {
  return value && typeof value === 'object' ? [value, ...Object.values(value).flatMap(objects)] : [];
}

function squareGame() {
  const game = fixture(2, 3);
  game.chests = [];
  delete game.maze.layout;
  game.maze.rows = 2;
  game.maze.cells = [
    { row: 0, column: 0, links: ['east', 'south'] },
    { row: 0, column: 1, links: ['south', 'west'] },
    { row: 1, column: 0, links: ['north', 'east'] },
    { row: 1, column: 1, links: ['north', 'west'] },
  ];
  return game;
}

describe('durable RPG observation validation', () => {
  it('accepts actual observeRpg output and its JSON round trip, including cropped exits', () => {
    const receipt = observeRpg(fixture(), identity());
    if (receipt.status !== 'observed') throw new Error('Missing receipt');
    expect(receipt.cells[2].links).not.toContain('east');
    expect(receipt.cells[2].blocked).not.toContain('east');
    expect(validateRpgObservation(receipt)).toEqual(receipt);
    expect(validateRpgObservation(JSON.parse(JSON.stringify(receipt)))).toEqual(receipt);
  });

  it.each([0, 1, 7, 16])('accepts a real radius-%s receipt', radius => {
    const receipt = observed(fixture(30, radius));
    expect(validateRpgObservation(receipt)).toEqual(receipt);
    expect(receipt.cells).toHaveLength(radius + 1);
  });

  it.each([1, 10])('accepts real structured-v3 floor-%s receipts', floor => {
    const game = fixture();
    game.dungeonLevel = floor;
    game.maze = generateModuleMaze(createModuleRecipe('durable-observation-proof', floor, 42));
    const receipt = observed(game);
    expect(validateRpgObservation(receipt)).toEqual(receipt);
  });

  it('accepts sparse real receipts without requiring omitted exits to be walls', () => {
    const game = fixture(20, 7);
    game.maze.cells = game.maze.cells.slice(0, 3).reverse();
    const receipt = observed(game);
    expect(receipt.cells).toHaveLength(3);
    expect(validateRpgObservation(receipt)).toEqual(receipt);
  });

  it('accepts the maximum 545-cell radius-16 receipt', () => {
    const game = fixture(33, 16);
    game.maze.rows = 33;
    game.maze.active = { row: 16, column: 16 };
    game.maze.cells = Array.from({ length: 33 * 33 }, (_, index) => ({ row: Math.floor(index / 33), column: index % 33,
      links: ['north', 'east', 'south', 'west'] }));
    const receipt = observed(game);
    expect(receipt.cells).toHaveLength(545);
    expect(validateRpgObservation(receipt)).toEqual(receipt);
  });

  it('accepts eight rooms and chests per cell and repeated room associations across cells', () => {
    const game = fixture();
    game.maze.layout!.rooms = Array.from({ length: 8 }, (_, index) => ({ ...roomAt(`room-${index}`, 'safe', 1), columns: 2 }));
    game.chests = Array.from({ length: 8 }, (_, index) => ({ ...chestAt(1, index % 2 === 0), id: `chest-${index}` }));
    const receipt = observed(game);
    expect(receipt.cells[1].roomIds).toHaveLength(8);
    expect(receipt.cells[2].roomIds).toEqual(receipt.cells[1].roomIds);
    expect(receipt.cells[1].chests).toHaveLength(8);
    expect(validateRpgObservation(receipt)).toEqual(receipt);
  });

  it('accepts cycles, unordered cells/directions/features, and uses the shortest linked route', () => {
    const receipt = mutable(squareGame());
    receipt.policy.radius = 2;
    receipt.cells.reverse();
    for (const cell of receipt.cells) {
      cell.links.reverse();
      cell.blocked.reverse();
      cell.roomIds = ['z', 'a'];
      cell.chests = ['z', 'a'].map(id => ({ id: `${id}-${cell.address.row}-${cell.address.column}`,
        position: { ...cell.address }, opened: true }));
    }
    expect(validateRpgObservation(receipt)).toEqual(receipt);
  });

  it.each(['2024-02-29T23:59:59Z', '2000-02-29T00:00:00.1Z', '2026-10-11T12:30:00.123456Z',
    '2026-10-11T12:30:00-05:00', '2026-01-01T00:15:00+01:00', '0000-02-29T00:00:00Z',
    '+010000-01-01T00:00:00.000Z'])('accepts valid ISO calendar timestamp %s', observedAt => {
    const receipt = observeRpg(fixture(), { ...identity(), observedAt });
    expect(receipt.status).toBe('observed');
    expect(validateRpgObservation(receipt)).toEqual(receipt);
  });

  it.each([0, Number.MAX_SAFE_INTEGER])('accepts domain revision/epoch boundary %s', value => {
    const receipt = mutable();
    receipt.revision.epoch = value;
    receipt.revision.revision = value;
    expect(validateRpgObservation(receipt)).toEqual(receipt);
  });

  it('accepts safe address boundaries and exact-length IDs without interpreting IDs as keys', () => {
    const receipt = mutable(fixture(20, 0));
    receipt.actor = { floor: Number.MAX_SAFE_INTEGER, row: Number.MAX_SAFE_INTEGER - 1, column: Number.MAX_SAFE_INTEGER - 1 };
    receipt.cells[0].address = { ...receipt.actor };
    receipt.id = 'x'.repeat(128);
    receipt.gameId = '__proto__';
    receipt.revision.owner = 'constructor';
    receipt.cells[0].roomIds = ['__proto__', 'constructor', 'x'.repeat(128)];
    receipt.cells[0].chests = [{ id: 'x'.repeat(128), position: { ...receipt.actor }, opened: false }];
    expect(validateRpgObservation(receipt)).toEqual(receipt);
  });

  const objectPaths = ['', 'revision', 'actor', 'policy', 'cells.0', 'cells.0.address',
    'cells.1.chests.0', 'cells.1.chests.0.position'];

  it.each(objectPaths)('rejects unknown keys on %s', path => {
    const receipt = mutable();
    at(receipt, path).hiddenWorld = { loot: 'not observed' };
    expect(() => validateRpgObservation(receipt)).toThrow(/unexpected or missing keys/);
  });

  it.each(objectPaths)('requires every allowlisted field on %s', path => {
    for (const key of Object.keys(at(mutable(), path))) {
      const receipt = mutable();
      delete at(receipt, path)[key];
      expect(() => validateRpgObservation(receipt)).toThrow(/unexpected or missing keys/);
    }
  });

  it.each(['__proto__', 'constructor', 'toJSON', Symbol('hidden')])('rejects hostile own key %s', key => {
    const receipt = mutable();
    Object.defineProperty(receipt.cells[1].chests[0], key, { value: 'hidden', enumerable: true });
    expect(() => validateRpgObservation(receipt)).toThrow(/unexpected or missing keys/);
  });

  it.each(objectPaths)('rejects hidden fields, accessors and custom prototypes on %s without reading getters', path => {
    const hidden = mutable();
    Object.defineProperty(at(hidden, path), 'secret', { value: true });
    expect(() => validateRpgObservation(hidden)).toThrow();
    const accessor = mutable();
    const target = at(accessor, path);
    const getter = vi.fn(() => { throw new Error('Must not read'); });
    Object.defineProperty(target, Object.keys(target)[0], { get: getter, enumerable: true });
    expect(() => validateRpgObservation(accessor)).toThrow(/must be data/);
    expect(getter).not.toHaveBeenCalled();
    const inherited = mutable();
    Object.setPrototypeOf(at(inherited, path), { hidden: true });
    expect(() => validateRpgObservation(inherited)).toThrow(/plain object/);
  });

  it('accepts plain null-prototype records and copies them to owned objects', () => {
    const receipt = mutable();
    for (const path of objectPaths) Object.setPrototypeOf(at(receipt, path), null);
    expect(validateRpgObservation(receipt)).toEqual(receipt);
  });

  const listPaths = ['cells', 'cells.0.roomIds', 'cells.0.chests', 'cells.0.stairs', 'cells.0.links', 'cells.0.blocked'];

  it.each(listPaths)('rejects non-arrays, sparse arrays, custom keys and accessors at %s', path => {
    for (const replacement of [null, {}, 'north', new Array(1), Object.assign([], { secret: true }),
      Object.defineProperty([], Symbol('secret'), { value: true })]) {
      const receipt = mutable();
      replace(receipt, path, replacement);
      expect(() => validateRpgObservation(receipt)).toThrow();
    }
    const receipt = mutable();
    const getter = vi.fn(() => { throw new Error('Must not read'); });
    const replacement = Object.defineProperty([null], 0, { get: getter, enumerable: true });
    replace(receipt, path, replacement);
    expect(() => validateRpgObservation(receipt)).toThrow(/must be data/);
    expect(getter).not.toHaveBeenCalled();
  });

  it.each([null, undefined, 1, true, 'receipt', [], new Date(), () => ({}), { status: 'refused', reason: 'invalid_identity' }])(
    'rejects non-receipt input %s', value => {
      expect(() => validateRpgObservation(value)).toThrow(/Invalid RPG observation/);
    });

  it.each(['id', 'gameId', 'revision.owner', 'cells.0.roomIds.0', 'cells.1.chests.0.id'])(
    'rejects invalid IDs at %s', path => {
      for (const value of ['', 'x'.repeat(129), 1, null, {}, ['id']]) {
        const receipt = mutable();
        replace(receipt, path, value);
        expect(() => validateRpgObservation(receipt)).toThrow(/valid ID/);
      }
    });

  it.each(['revision.epoch', 'revision.revision', 'policy.radius', 'actor.row', 'actor.column', 'actor.floor',
    'cells.0.address.row', 'cells.0.address.column', 'cells.0.address.floor',
    'cells.1.chests.0.position.floor', 'cells.1.chests.0.position.row', 'cells.1.chests.0.position.column'])(
    'rejects unsafe/noninteger values at %s', path => {
      for (const value of [-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null, true, {}]) {
        const receipt = mutable();
        replace(receipt, path, value);
        expect(() => validateRpgObservation(receipt)).toThrow(/bounded safe integer/);
      }
    });

  it.each(['actor.floor', 'cells.0.address.floor', 'cells.1.chests.0.position.floor'])('rejects floor zero at %s', path => {
    const receipt = mutable();
    replace(receipt, path, 0);
    expect(() => validateRpgObservation(receipt)).toThrow(/bounded safe integer/);
  });

  it.each(['actor.row', 'actor.column', 'cells.0.address.row', 'cells.0.address.column',
    'cells.1.chests.0.position.row', 'cells.1.chests.0.position.column'])('leaves coordinate arithmetic headroom at %s', path => {
    const receipt = mutable();
    replace(receipt, path, Number.MAX_SAFE_INTEGER);
    expect(() => validateRpgObservation(receipt)).toThrow(/bounded safe integer/);
  });

  it.each(['', 'yesterday', '2026-10-11', 'October 11, 2026', '2026-10-11T12:00:00', '2026-10-11 12:00:00Z',
    '2026-02-29T00:00:00Z', '1900-02-29T00:00:00Z', '2024-02-30T00:00:00Z', '2026-04-31T00:00:00+01:00',
    '2026-13-01T00:00:00Z', '2026-01-00T00:00:00Z', '2026-10-11T24:00:00Z', '2026-10-11T00:60:00Z',
    '2026-10-11T00:00:60Z', '2026-10-11T00:00:00+24:00', '2026-10-11T00:00:00+01:60',
    '2026-10-11T00:00:00.123456789012345678901234567890Z', null, 1791676800000])('rejects invalid/non-ISO time %s', value => {
    const receipt = mutable();
    replace(receipt, 'observedAt', value);
    expect(() => validateRpgObservation(receipt)).toThrow(/observedAt/);
  });

  it.each([
    ['status', 'known'], ['version', 2], ['version', '1'], ['policy.kind', 'all-world'], ['policy.radius', 17],
    ['actor', null], ['revision', []], ['policy', []], ['cells.0', null], ['cells.0.address', {}],
    ['cells.1.chests.0', null], ['cells.1.chests.0.position', []], ['cells.1.chests.0.opened', 1],
    ['cells.1.chests.0.opened', 'false'], ['cells.1.chests.0.opened', null],
    ['cells.0.links', ['up']], ['cells.0.links', ['East']], ['cells.0.links', [null]],
    ['cells.0.blocked', ['down']], ['cells.0.blocked', [1]], ['cells.0.stairs', ['north']], ['cells.0.stairs', [false]],
  ])('rejects invalid field %s = %s', (path, value) => {
    const receipt = mutable();
    replace(receipt, path as string, value);
    expect(() => validateRpgObservation(receipt)).toThrow(/Invalid RPG observation/);
  });

  it.each(['cells', 'cells.1.roomIds', 'cells.1.chests'])('enforces the collection bound for %s', path => {
    const receipt = mutable();
    const maximum = path === 'cells' ? 545 : 8;
    const first = at(receipt, path)['0'];
    replace(receipt, path, Array.from({ length: maximum + 1 }, () => first));
    expect(() => validateRpgObservation(receipt)).toThrow(/array of at most/);
  });

  it.each(['cells.0.links', 'cells.0.blocked', 'cells.0.stairs', 'cells.0.roomIds', 'cells.1.chests', 'cells'])(
    'rejects duplicates in %s', path => {
      const receipt = mutable();
      const entries = at(receipt, path) as unknown as unknown[];
      entries.push(entries[0]);
      expect(() => validateRpgObservation(receipt)).toThrow(/duplicate/);
    });

  it('rejects the same chest ID in different cells even when each position is valid', () => {
    const receipt = mutable();
    receipt.cells[2].chests = [{ ...receipt.cells[1].chests[0], position: address(2) }];
    expect(() => validateRpgObservation(receipt)).toThrow(/duplicate IDs/);
  });

  it.each([
    ['cells.1.address.floor', 2], ['cells.1.chests.0.position.floor', 2],
    ['cells.1.chests.0.position.column', 2], ['cells.1.chests.0.position.row', 1],
  ])('rejects floor or chest-cell mismatch at %s', (path, value) => {
    const receipt = mutable();
    replace(receipt, path as string, value);
    expect(() => validateRpgObservation(receipt)).toThrow(/actor floor|at its cell/);
  });

  it('requires the actor in a nonempty receipt', () => {
    const receipt = mutable();
    receipt.actor.column = 10;
    expect(() => validateRpgObservation(receipt)).toThrow(/actor must be in cells/);
    receipt.cells = [];
    expect(() => validateRpgObservation(receipt)).toThrow(/actor must be in cells/);
  });

  const graphCases: [string, (receipt: Receipt) => void][] = [
    ['overlapping links and walls', receipt => { receipt.cells[0].blocked.push('east'); }],
    ['dangling cropped link', receipt => { receipt.cells[2].links.push('east'); }],
    ['link outside safe coordinates', receipt => { receipt.cells[0].links.push('west'); receipt.cells[0].blocked.pop(); }],
    ['nonreciprocal link', receipt => { receipt.cells[1].links = ['east']; receipt.cells[1].blocked.push('west'); }],
    ['wrong endpoint', receipt => { receipt.cells[2].address.column = 3; }],
  ];
  it.each(graphCases)('rejects %s', (_, tamper) => {
    const receipt = mutable();
    tamper(receipt);
    expect(() => validateRpgObservation(receipt)).toThrow(/overlap|reciprocal endpoints/);
  });

  it('rejects disconnected cells even when the remaining links are reciprocal', () => {
    const receipt = mutable();
    receipt.cells[0].links = [];
    receipt.cells[0].blocked.push('east');
    receipt.cells[1].links = ['east'];
    receipt.cells[1].blocked.push('west');
    expect(() => validateRpgObservation(receipt)).toThrow(/reachable.*radius/);
  });

  it('does not allow an omitted internal edge to masquerade as a cropped exit', () => {
    const receipt = mutable(squareGame());
    receipt.cells[0].links = ['east'];
    receipt.cells[2].links = ['east'];
    expect(() => validateRpgObservation(receipt)).toThrow(/linked or blocked/);
  });

  it.each([0, 1])('rejects excess connected cells outside radius %s', radius => {
    const receipt = mutable();
    receipt.policy.radius = radius;
    expect(() => validateRpgObservation(receipt)).toThrow(/reachable.*radius/);
  });

  it('measures radius through links, not geometric distance', () => {
    const game = squareGame();
    game.maze.cells[0].links = ['east'];
    game.maze.cells[2].links = ['east'];
    const receipt = mutable(game);
    expect(validateRpgObservation(receipt)).toEqual(receipt);
    receipt.policy.radius = 2;
    expect(() => validateRpgObservation(receipt)).toThrow(/reachable.*radius/);
  });

  it('returns a deeply frozen owned copy without mutating or freezing caller objects', () => {
    const receipt = mutable();
    receipt.actor = receipt.cells[0].address;
    receipt.cells[1].chests[0].position = receipt.cells[1].address;
    const before = JSON.stringify(receipt);
    const callerObjects = new Set(objects(receipt));
    const result = validateRpgObservation(receipt);
    expect(result).toEqual(receipt);
    expect(JSON.stringify(receipt)).toBe(before);
    expect([...callerObjects].every(value => !Object.isFrozen(value))).toBe(true);
    for (const value of objects(result)) {
      expect(Object.isFrozen(value)).toBe(true);
      expect(callerObjects.has(value)).toBe(false);
    }
    receipt.actor.column = 99;
    receipt.revision.revision = 99;
    receipt.cells[1].chests[0].opened = true;
    receipt.cells[1].roomIds.push('later-room');
    receipt.cells[0].links.length = 0;
    expect(result).toEqual(JSON.parse(before));
    expect(() => { (result as Receipt).cells[1].chests[0].opened = true; }).toThrow(TypeError);
  });

  it('does not mutate or freeze rejected input', () => {
    const receipt = mutable();
    receipt.policy.radius = 0;
    const before = JSON.stringify(receipt);
    expect(() => validateRpgObservation(receipt)).toThrow();
    expect(JSON.stringify(receipt)).toBe(before);
    expect(objects(receipt).every(value => !Object.isFrozen(value))).toBe(true);
  });
});
