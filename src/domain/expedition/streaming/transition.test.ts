import { describe, expect, it } from 'vitest';
import { movePosition } from '../../maze/movement';
import type { Direction } from '../../types';
import { addressKey } from '../address';
import { materializeTopologySpace, resolvedSpaceSpec } from '../topology/projection';
import { observeStream } from './observation';
import { StreamHarness } from './testSupport';

async function walk(test: StreamHarness, row: number, column: number) {
  const spaceId = test.checkpoint.position.spaceId;
  const cells = new Map(materializeTopologySpace(test.room().space).cells.map(cell => [addressKey({ spaceId, ...cell }), cell]));
  const queue = [{ ...test.checkpoint.position, path: [] as Direction[] }];
  const seen = new Set<string>();
  for (const current of queue) {
    if (current.row === row && current.column === column) {
      for (const direction of current.path) expect((await test.step({ type: 'move', direction })).applied).toBe(true);
      return;
    }
    for (const direction of cells.get(addressKey(current))!.links) {
      const next = { ...movePosition(current, direction), spaceId };
      const key = addressKey(next);
      if (!seen.has(key)) { seen.add(key); queue.push({ ...next, path: [...current.path, direction] }); }
    }
  }
  throw new Error('Test destination unreachable');
}

describe('streamed gameplay transitions', () => {
  it('shows observed reservations, never promised geometry or hidden topology', () => {
    const test = new StreamHarness();
    const room = test.room();
    const observation = observeStream(test.checkpoint, room, room.knowledge!, materializeTopologySpace(room.space));
    expect(observation.visibleFrontiers).toHaveLength(4);
    expect(observation.visibleOpenings).toEqual([]);
    expect(Object.keys(room.knowledge!.cells).length).toBeLessThan(materializeTopologySpace(room.space).cells.length);
    for (const forbidden of ['seed', 'recipe', 'fallback', 'roomBudget', 'connections', 'sockets', 'origin']) {
      expect(JSON.stringify(observation)).not.toContain(`"${forbidden}"`);
    }
  });

  it('prepares canonical work without pretending to move or exposing unrelated rooms', async () => {
    const test = new StreamHarness();
    const position = structuredClone(test.checkpoint.position);
    const last = test.room().sockets.at(-1)!;
    for (let step = 0; step < 4; step++) {
      const before = test.checkpoint;
      const result = await test.step({ type: 'prepare', frontierId: last.id });
      expect(result.applied).toBe(true);
      expect(test.checkpoint.revision).toBe(before.revision + 1);
      expect(test.checkpoint.topologyRevision).toBe(before.topologyRevision + 1);
      expect(test.checkpoint.position).toEqual(position);
      expect(test.checkpoint.moves).toBe(0);
      expect(test.checkpoint.visitedSpaces).toBe(1);
      expect(result.observation.visibleCells.every(cell => cell.spaceId === 'entry')).toBe(true);
      expect(result.observation.visibleOpenings.every(port => port.destination === undefined)).toBe(true);
    }
    expect(test.room().knowledge!.frontiers[last.id]).toBeUndefined();
    expect(test.topology.header().rooms).toBe(5);
    expect(test.pages.size).toBe(1);
  });

  it('refuses unknown or off-screen preparation before changing topology', async () => {
    const test = new StreamHarness();
    expect((await test.step({ type: 'prepare', frontierId: 'socket-999' })).applied).toBe(false);
    const north = test.room().sockets.find(socket => socket.direction === 'north')!;
    await walk(test, 8, 4);
    const before = test.topology.header();
    expect((await test.step({ type: 'prepare', frontierId: north.id })).applied).toBe(false);
    expect(test.topology.header()).toEqual(before);
  });

  it('does not permit travel through an unresolved socket', async () => {
    const test = new StreamHarness();
    await walk(test, 0, 4);
    const before = structuredClone(test.checkpoint);
    expect((await test.step({ type: 'move', direction: 'north' })).applied).toBe(false);
    expect(test.checkpoint).toEqual(before);
    expect(test.topology.spaceIds()).toEqual(['entry']);
  });

  it('learns both endpoints on crossing and persists local loot exactly once', async () => {
    const test = new StreamHarness();
    const socket = test.room().sockets[0];
    const entryGeometry = materializeTopologySpace(test.room().space);
    await test.step({ type: 'prepare', frontierId: socket.id });
    expect(materializeTopologySpace(test.room().space)).toEqual(entryGeometry);
    await walk(test, socket.source.row, socket.source.column);
    expect((await test.step({ type: 'move', direction: socket.direction })).applied).toBe(true);
    expect(test.checkpoint.visitedSpaces).toBe(2);
    const passage = test.room();
    expect(passage.knowledge!.parentOpeningId).toBeDefined();
    const exit = resolvedSpaceSpec(passage.space, passage.connections).openings.find(port => port.id !== passage.knowledge!.parentOpeningId)!;
    await walk(test, exit.cell.row, exit.cell.column);
    await test.step({ type: 'move', direction: exit.direction });
    expect(test.checkpoint.visitedSpaces).toBe(3);
    const parentId = test.room().knowledge!.parentOpeningId!;
    expect(test.room().knowledge!.openings[parentId].destination?.spaceId).toBe(passage.space.spec.id);
    await walk(test, 1, 1);
    expect((await test.step({ type: 'collect' })).applied).toBe(true);
    const collected = structuredClone(test.checkpoint);
    expect((await test.step({ type: 'collect' })).applied).toBe(false);
    expect(test.checkpoint).toEqual(collected);
    expect(test.checkpoint.collectedChests).toBe(1);
  });

  it('requires a sealed, explored scope and home position before finishing', async () => {
    const test = new StreamHarness();
    expect((await test.step({ type: 'finish' })).applied).toBe(false);
    expect(test.checkpoint.phase).toBe('exploring');
    expect(test.checkpoint.revision).toBe(0);
  });
});
