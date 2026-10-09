import { describe, expect, it, vi } from 'vitest';
import { cellKey } from '../../maze/key';
import { movePosition, opposite } from '../../maze/movement';
import { createTopology, expandTopology } from './generation';
import { overlaps, reservedBounds, spaceBounds, world } from './geometry';
import { MemoryTopology } from './memoryTopology';
import { OccupancyIndex } from './occupancy';
import { materializeTopologySpace, resolvedSpaceSpec } from './projection';
import type { TopologyDelta, TopologyReader, TopologyRecipe, TopologySpace } from './types';

const recipe = (seed = 0, level = 19): TopologyRecipe => ({ version: 'spaces-v2', worldId: 'audit', floorId: 'one', seed, level });
function proposal(store: TopologyReader, requestId = 'next') {
  const result = expandTopology(store, store.header().revision, requestId);
  if (result.status !== 'ready') throw new Error('Expected ready proposal');
  return result.delta;
}
function snapshot(store: MemoryTopology) {
  const header = store.header();
  return { header, occupancy: store.occupancy.values(),
    spaces: store.spaceIds().map(id => [store.space(id), store.connections(id)]),
    sockets: Array.from({ length: header.socketCount }, (_, sequence) => store.socket(sequence)) };
}

describe('reservation and commit failure boundaries', () => {
  it('consumes a real reserved fallback in an enclosed cavity and seals below quota honestly', () => {
    const initial = createTopology(recipe());
    const source = initial.spaces[0];
    const socket = initial.sockets[0];
    const header = { ...initial.header, socketCount: 1 };
    const bounds = reservedBounds(source.spec, socket);
    const index = new OccupancyIndex();
    index.add({ id: source.spec.id, kind: 'space', bounds: spaceBounds(source.spec) });
    index.add({ id: socket.id, kind: 'reservation', bounds });
    // A one-cell obstacle ring leaves precisely the promised room/access cavity.
    for (let row = bounds.row - 1; row <= bounds.row + bounds.rows; row++) {
      for (let column = bounds.column - 1; column <= bounds.column + bounds.columns; column++) {
        const tile = { row, column, rows: 1, columns: 1 };
        if (!index.occupied(tile)) index.add({ id: `wall:${row}:${column}`, kind: 'space', bounds: tile });
      }
    }
    const reader: TopologyReader = { header: () => structuredClone(header), space: id => id === source.spec.id ? source : undefined,
      socket: sequence => sequence === 0 ? socket : undefined, occupied: (area, except) => index.occupied(area, except) };
    expect(index.occupied(bounds, socket.id)).toBe(false);
    const delta = proposal(reader);
    expect(delta.work.candidates).toBe(8);
    expect(spaceBounds(delta.spaces[0].spec)).toEqual(socket.fallback);
    expect(delta.sockets).toEqual([]);
    expect(delta.header.rooms).toBe(2);
    expect(delta.header.seal).toEqual({ revision: 1, reason: 'spatial-limit' });
    expect(delta.header.nextSocket).toBe(delta.header.socketCount);
    expect(delta.removeOccupancy).toEqual([socket.id]);
    for (const entry of delta.addOccupancy) expect(index.occupied(entry.bounds, socket.id)).toBe(false);
    expect(overlaps(delta.addOccupancy[0].bounds, delta.addOccupancy[1].bounds)).toBe(false);
    const spaces = new Map([source, ...delta.spaces].map(space => [space.spec.id, space]));
    for (const connection of delta.connections) {
      expect(movePosition(world(spaces.get(connection.from.spaceId)!.spec, connection.from), connection.direction))
        .toEqual(world(spaces.get(connection.to.spaceId)!.spec, connection.to));
    }
    expect(proposal(reader)).toEqual(delta);
  });

  it.each(['header', 'identity', 'connections', 'reservation', 'occupancy'] as const)
    ('rejects a forged %s without consuming a reservation or request ID', (field) => {
      const store = new MemoryTopology(recipe());
      const delta = proposal(store);
      const forged = structuredClone(delta);
      switch (field) {
        case 'header': forged.header.rooms++; break;
        case 'identity': forged.spaces[1].spec.id = forged.spaces[0].spec.id; break;
        case 'connections': forged.connections.pop(); break;
        case 'reservation': forged.removeOccupancy = []; break;
        case 'occupancy': forged.addOccupancy[0].bounds.row++; break;
      }
      const before = snapshot(store);
      expect(() => store.commit(forged)).toThrow(/Invalid topology/);
      expect(snapshot(store)).toEqual(before);
      expect(store.commit(delta).status).toBe('applied');
      expect(store.commit(delta).status).toBe('duplicate');
    });

  it('defensively owns committed inputs and all exposed topology records', () => {
    const store = new MemoryTopology(recipe());
    const delta = proposal(store);
    const retry = structuredClone(delta);
    store.commit(delta);
    const before = snapshot(store);
    delta.header.rooms = 10000;
    delta.spaces[0].spec.origin.row += 10000;
    delta.resolved!.status = 'pending';
    store.header().recipe.seed = 123;
    store.space('entry')!.spec.origin.row = 123;
    store.socket(0)!.source.row = 123;
    store.connections('entry')[0].to.row = 123;
    store.occupancy.values()[0].bounds.row = 123;
    expect(snapshot(store)).toEqual(before);
    expect(store.commit(retry).status).toBe('duplicate');
  });

  it('keeps identities independent of request IDs and preserves receipts through sealing', () => {
    const first = new MemoryTopology(recipe(0, 1));
    const second = new MemoryTopology(recipe(0, 1));
    const committed: TopologyDelta[] = [];
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Ambient random'); });
    try {
      while (!first.header().seal) {
        const delta = proposal(first, `first-${first.header().revision}`);
        const alternate = proposal(second, `second-${second.header().revision}`);
        expect({ ...alternate, requestId: delta.requestId }).toEqual(delta);
        expect(proposal(first, delta.requestId)).toEqual(delta);
        first.commit(delta);
        second.commit(alternate);
        committed.push(delta);
      }
    } finally { random.mockRestore(); }
    expect(snapshot(first)).toEqual(snapshot(second));
    const sealed = snapshot(first);
    for (const delta of committed) expect(first.commit(delta).status).toBe('duplicate');
    expect(snapshot(first)).toEqual(sealed);
    expect(expandTopology(first, 0, 'stale')).toEqual({ status: 'conflict', revision: first.header().revision });
    const replay = new MemoryTopology(recipe(0, 1));
    for (const delta of JSON.parse(JSON.stringify(committed)) as TopologyDelta[]) replay.commit(delta);
    expect(snapshot(replay)).toEqual(sealed);
  });

  it('does not mistake receipt exhaustion for a finite floor seal', () => {
    const store = new MemoryTopology(recipe(3, 1000), 2);
    store.commit(proposal(store, 'first'));
    const before = snapshot(store);
    const delta = proposal(store, 'second');
    expect(() => store.commit(delta)).toThrow(/receipt budget/);
    expect(snapshot(store)).toEqual(before);
    expect(store.header().seal).toBeUndefined();
    expect(store.header().nextSocket).toBeLessThan(store.header().socketCount);
  });
});

describe('large-floor immutable connected geometry', () => {
  it.each([0, 0xffffffff])('retains every committed space and reciprocal endpoint at level 1000, seed %s', seed => {
    const store = new MemoryTopology(recipe(seed, 1000));
    const originals = new Map<string, TopologySpace>([['entry', store.space('entry')!]]);
    while (!store.header().seal) {
      const delta = proposal(store, `step-${store.header().revision}`);
      for (const space of delta.spaces) {
        expect(originals.has(space.spec.id)).toBe(false);
        originals.set(space.spec.id, structuredClone(space));
      }
      store.commit(delta);
    }
    const endpointIds = new Set<string>();
    const visited = new Set<string>();
    const queue = ['entry'];
    for (let index = 0; index < queue.length; index++) {
      const id = queue[index];
      if (visited.has(id)) continue;
      visited.add(id);
      const space = store.space(id)!;
      expect(space).toEqual(originals.get(id));
      const spec = resolvedSpaceSpec(space, store.connections(id));
      const geometry = materializeTopologySpace(space);
      const floor = new Map(geometry.cells.map(cell => [cellKey(cell), cell]));
      expect(geometry.cells.length).toBeLessThanOrEqual(512);
      const reached = new Set<string>();
      const cells = [geometry.cells[0]];
      for (let cursor = 0; cursor < cells.length; cursor++) {
        const cell = cells[cursor];
        if (reached.has(cellKey(cell))) continue;
        reached.add(cellKey(cell));
        if (!cell.links.length) {
          expect(space.spec.kind).toBe('passage');
          expect(geometry.cells).toHaveLength(1);
          expect(spec.openings).toHaveLength(2);
        }
        for (const direction of cell.links) {
          const next = floor.get(cellKey(movePosition(cell, direction)))!;
          expect(next?.links).toContain(opposite(direction));
          cells.push(next);
        }
      }
      expect(reached.size).toBe(floor.size);
      for (const chest of spec.chests) expect(reached.has(cellKey(chest.cell))).toBe(true);
      for (const port of spec.openings) {
        expect(endpointIds.has(port.id)).toBe(false);
        endpointIds.add(port.id);
        expect(reached.has(cellKey(port.cell))).toBe(true);
        expect(floor.get(cellKey(port.cell))!.links).not.toContain(port.direction);
        expect(spec.chests.some(chest => cellKey(chest.cell) === cellKey(port.cell))).toBe(false);
        const target = store.space(port.destination.spaceId)!;
        expect(target).toBeDefined();
        expect(movePosition(world(spec, port.cell), port.direction)).toEqual(world(target.spec, port.destination));
        const reciprocal = resolvedSpaceSpec(target, store.connections(target.spec.id)).openings.filter(other =>
          other.direction === opposite(port.direction) && cellKey(other.cell) === cellKey(port.destination) &&
          other.destination.spaceId === id && cellKey(other.destination) === cellKey(port.cell));
        expect(reciprocal).toHaveLength(1);
        expect(reciprocal[0].id).not.toBe(port.id);
        queue.push(target.spec.id);
      }
    }
    expect(visited.size).toBe(store.spaceIds().length);
    expect(endpointIds.size).toBe(4 * (store.header().rooms - 1));
  }, 60000);
});
