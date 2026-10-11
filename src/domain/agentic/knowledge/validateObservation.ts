import type { Direction } from '../../types';
import { cellKey, samePosition } from '../../maze/key';
import { movePosition, opposite } from '../../maze/movement';
import { directions, freeze, integer, validId, validTime } from './shared';
import { RPG_KNOWLEDGE_LIMITS as LIMITS, type RpgAddress, type RpgObservation,
  type RpgObservedCell, type RpgStair } from './types';

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid RPG observation: ${message}`);
}

function record(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), `${path} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  check(prototype === Object.prototype || prototype === null, `${path} must be a plain object`);
  const ownKeys = Reflect.ownKeys(value);
  check(ownKeys.length === keys.length && ownKeys.every(key => typeof key === 'string' && keys.includes(key)),
    `${path} has unexpected or missing keys`);
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    check(descriptor?.enumerable && Object.hasOwn(descriptor, 'value'), `${path}.${key} must be data`);
    result[key] = descriptor.value;
  }
  return result;
}

function list(value: unknown, maximum: number, path: string): unknown[] {
  check(Array.isArray(value) && value.length <= maximum, `${path} must be an array of at most ${maximum} entries`);
  check(Object.getPrototypeOf(value) === Array.prototype && Reflect.ownKeys(value).length === value.length + 1,
    `${path} must be a plain dense array`);
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    check(descriptor?.enumerable && Object.hasOwn(descriptor, 'value'), `${path}[${index}] must be data`);
    result.push(descriptor.value);
  }
  return result;
}

function id(value: unknown, path: string): string {
  check(typeof value === 'string' && validId(value), `${path} must be a valid ID`);
  return value;
}

function number(value: unknown, minimum: number, path: string, maximum = Number.MAX_SAFE_INTEGER): number {
  check(typeof value === 'number' && integer(value, minimum, maximum), `${path} must be a bounded safe integer`);
  return value;
}

function address(value: unknown, path: string): RpgAddress {
  const input = record(value, ['floor', 'row', 'column'], path);
  return { floor: number(input.floor, 1, `${path}.floor`),
    row: number(input.row, 0, `${path}.row`, Number.MAX_SAFE_INTEGER - 1),
    column: number(input.column, 0, `${path}.column`, Number.MAX_SAFE_INTEGER - 1) };
}

function enumeration<T extends string>(value: unknown, allowed: readonly T[], path: string): T[] {
  const entries = list(value, allowed.length, path).map(entry => {
    check(typeof entry === 'string' && allowed.includes(entry as T), `${path} has an invalid value`);
    return entry as T;
  });
  check(new Set(entries).size === entries.length, `${path} has duplicates`);
  return entries;
}

function timestamp(value: unknown): string {
  check(typeof value === 'string' && validTime(value), 'observedAt must be a valid ISO timestamp');
  const match = /^((\d{4}|[+-]\d{6})-(\d{2})-(\d{2}))T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  check(match, 'observedAt must be a timezone-qualified ISO timestamp');
  // Date.parse normalizes impossible calendar dates such as February 30.
  const date = new Date(`${match[1]}T00:00:00.000Z`);
  check(date.getUTCFullYear() === Number(match[2]) && date.getUTCMonth() + 1 === Number(match[3])
    && date.getUTCDate() === Number(match[4]), 'observedAt has an invalid calendar date');
  return value;
}

function validateGraph(cells: readonly RpgObservedCell[], actor: RpgAddress, radius: number) {
  const byKey = new Map(cells.map(cell => [cellKey(cell.address), cell]));
  check(byKey.size === cells.length, 'cells have duplicate addresses');
  const origin = byKey.get(cellKey(actor));
  check(origin, 'actor must be in cells');
  for (const cell of cells) {
    for (const direction of directions) {
      const destination = byKey.get(cellKey(movePosition(cell.address, direction)));
      if (cell.links.includes(direction)) {
        check(destination?.links.includes(opposite(direction)), 'links must have reciprocal endpoints in cells');
      } else if (destination) {
        check(cell.blocked.includes(direction), 'an edge between observed cells must be linked or blocked');
      }
      // Open exits toward cells outside the receipt are deliberately omitted, not blocked.
    }
  }
  const visited = new Set([cellKey(actor)]);
  const queue = [{ cell: origin, depth: 0 }];
  for (let index = 0; index < queue.length; index++) {
    const { cell, depth } = queue[index];
    if (depth >= radius) continue;
    for (const direction of cell.links) {
      const key = cellKey(movePosition(cell.address, direction));
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push({ cell: byKey.get(key)!, depth: depth + 1 });
    }
  }
  check(visited.size === cells.length, 'all cells must be reachable through supplied links within the radius');
}

/** Validate an untrusted durable receipt and return a deeply frozen, fully owned copy. */
export function validateRpgObservation(value: unknown): RpgObservation {
  const input = record(value, ['status', 'version', 'id', 'gameId', 'revision', 'observedAt', 'actor', 'policy', 'cells'], 'observation');
  check(input.status === 'observed' && input.version === 1, 'unsupported status or version');
  const observationId = id(input.id, 'id');
  const gameId = id(input.gameId, 'gameId');
  const revisionInput = record(input.revision, ['owner', 'epoch', 'revision'], 'revision');
  const revision = { owner: id(revisionInput.owner, 'revision.owner'),
    epoch: number(revisionInput.epoch, 0, 'revision.epoch'), revision: number(revisionInput.revision, 0, 'revision.revision') };
  const observedAt = timestamp(input.observedAt);
  const policyInput = record(input.policy, ['kind', 'radius'], 'policy');
  check(policyInput.kind === 'rpg-linked-bfs-v1', 'unsupported observation policy');
  const radius = number(policyInput.radius, 0, 'policy.radius', LIMITS.radius);
  const actor = address(input.actor, 'actor');
  const chestIds = new Set<string>();
  const cells: RpgObservedCell[] = list(input.cells, LIMITS.observationCells, 'cells').map((value, index) => {
    const path = `cells[${index}]`;
    const cell = record(value, ['address', 'roomIds', 'chests', 'stairs', 'links', 'blocked'], path);
    const position = address(cell.address, `${path}.address`);
    check(position.floor === actor.floor, `${path} must be on the actor floor`);
    const roomIds = list(cell.roomIds, LIMITS.roomsPerCell, `${path}.roomIds`).map(value => id(value, `${path}.roomIds`));
    check(new Set(roomIds).size === roomIds.length, `${path}.roomIds has duplicates`);
    const chests = list(cell.chests, LIMITS.chestsPerCell, `${path}.chests`).map((value, index) => {
      const chestPath = `${path}.chests[${index}]`;
      const chest = record(value, ['id', 'position', 'opened'], chestPath);
      const chestId = id(chest.id, `${chestPath}.id`);
      check(!chestIds.has(chestId), 'chests have duplicate IDs');
      chestIds.add(chestId);
      const chestPosition = address(chest.position, `${chestPath}.position`);
      check(chestPosition.floor === actor.floor && samePosition(chestPosition, position), `${chestPath} must be at its cell`);
      check(typeof chest.opened === 'boolean', `${chestPath}.opened must be a boolean`);
      return { id: chestId, position: chestPosition, opened: chest.opened };
    });
    const stairs = enumeration<RpgStair>(cell.stairs, ['up', 'down', 'town'], `${path}.stairs`);
    const links = enumeration<Direction>(cell.links, directions, `${path}.links`);
    const blocked = enumeration<Direction>(cell.blocked, directions, `${path}.blocked`);
    check(!links.some(direction => blocked.includes(direction)), `${path} links and blocked overlap`);
    return { address: position, roomIds, chests, stairs, links, blocked };
  });
  validateGraph(cells, actor, radius);
  return freeze({ status: 'observed', version: 1, id: observationId, gameId, revision, observedAt,
    actor, policy: { kind: 'rpg-linked-bfs-v1', radius }, cells });
}
