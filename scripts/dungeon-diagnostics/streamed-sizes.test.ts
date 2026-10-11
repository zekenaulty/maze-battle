// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MemoryTopology } from '../../src/domain/expedition/topology/memoryTopology';
import { choosePlacement, PLACEMENT_ATTEMPTS } from '../../src/domain/expedition/topology/placement';
import type { TopologyReader, TopologySpace } from '../../src/domain/expedition/topology/types';
import { inspectStreamedSnapshot, measureStreamed } from './streamed';

function room(id: string, rows: number, columns: number, column: number): TopologySpace {
  return { schematic: 'stone-room-v1', spec: { id, kind: 'room', name: id, seed: 0,
    origin: { row: 0, column }, rows, columns, openings: [], chests: [] } };
}
const start = { spaceId: 'root', row: 1, column: 1 };

describe('streamed room-size and fallback diagnostics', () => {
  it('counts both room dimensions, excludes passages, and requires both sides to be five', () => {
    const passage = room('passage', 1, 30, 400);
    passage.spec.kind = 'passage';
    const value = inspectStreamedSnapshot([
      room('root', 9, 9, 0), room('fallback', 5, 5, 100),
      room('candidate', 7, 15, 200), room('not-five-square', 5, 7, 300), passage,
    ], [], start);
    expect(value.roomSizes).toEqual({ minSide: 5, maxSide: 15,
      sideHistogram: { 5: 3, 7: 2, 9: 2, 15: 1 },
      nonEntryRooms: 3, nonEntry5x5Rooms: 1, nonEntry5x5Fraction: 1 / 3 });
  });

  it('excludes the actual start room, not only a hard-coded entry name', () => {
    const value = inspectStreamedSnapshot([room('root', 5, 5, 0)], [], start);
    expect(value.roomSizes).toEqual({ minSide: 5, maxSide: 5, sideHistogram: { 5: 2 },
      nonEntryRooms: 0, nonEntry5x5Rooms: 0, nonEntry5x5Fraction: null });
  });

  it('keeps absent extrema and fractions null and errors entirely unmeasured', () => {
    expect(inspectStreamedSnapshot([], [], start).roomSizes).toEqual({
      minSide: null, maxSide: null, sideHistogram: {}, nonEntryRooms: 0,
      nonEntry5x5Rooms: 0, nonEntry5x5Fraction: null,
    });
    expect(measureStreamed(-1, 1).metrics.roomSizes).toBeNull();
    expect(measureStreamed(0, 1, 0).metrics.roomSizes).toBeNull();
  });

  it.each([0, 1, 440, 0xffffffff])('checks the real candidate/fallback size distinction for seed %s', seed => {
    const host = new MemoryTopology({ version: 'spaces-v2', worldId: 'size-audit', floorId: 'one', seed, level: 19 });
    for (let sequence = 0; sequence < host.header().socketCount; sequence++) {
      const socket = host.socket(sequence)!;
      const source = host.space(socket.source.spaceId)!.spec;
      const reader: TopologyReader = { header: () => host.header(), space: id => host.space(id),
        socket: value => host.socket(value), occupied: () => false };
      const acceptedWork = { candidates: 0, occupancyQueries: 0 };
      const candidate = choosePlacement(reader, source, socket, acceptedWork);
      expect(acceptedWork.candidates).toBe(1);
      expect([7, 9, 11, 13, 15]).toContain(candidate.rows);
      expect([7, 9, 11, 13, 15]).toContain(candidate.columns);
      const rejectedWork = { candidates: 0, occupancyQueries: 0 };
      const fallback = choosePlacement({ ...reader, occupied: () => true }, source, socket, rejectedWork);
      expect(rejectedWork.candidates).toBe(PLACEMENT_ATTEMPTS);
      expect(fallback).toEqual(socket.fallback);
      expect(fallback).toMatchObject({ rows: 5, columns: 5 });
    }
  });

  it.each([[0, 2, 9, 1], [440, 19, 43, 18], [0, 60, 125, 65]])
    ('quantifies non-entry 5x5 prevalence for seed %s / level %s', (seed, level, nonEntryRooms, nonEntry5x5Rooms) => {
      const value = measureStreamed(seed, level);
      const sizes = value.metrics.roomSizes!;
      expect(value.status).toBe('complete');
      expect(sizes).toMatchObject({ minSide: 5, maxSide: 15, nonEntryRooms, nonEntry5x5Rooms,
        nonEntry5x5Fraction: nonEntry5x5Rooms / nonEntryRooms });
      expect(Object.values(sizes.sideHistogram).reduce((sum, count) => sum + count, 0)).toBe(2 * value.geometry.rooms.length);
      expect(sizes.sideHistogram[5]).toBe(2 * nonEntry5x5Rooms);
      const nonEntry = value.geometry.rooms.filter(room => room.id !== 'entry');
      expect(nonEntry.every(room => (room.rows === 5 && room.columns === 5) || (room.rows >= 7 && room.columns >= 7))).toBe(true);
      expect(value.metrics.physicalTraversal?.valid).toBe(true);
      expect(JSON.parse(JSON.stringify(value))).toEqual(value);
    });

  it('reports only the committed prefix at a room cap', () => {
    const value = measureStreamed(0, 19, 1);
    expect(value.status).toBe('limited');
    expect(value.metrics.roomSizes).toEqual({ minSide: 9, maxSide: 9, sideHistogram: { 9: 2 },
      nonEntryRooms: 0, nonEntry5x5Rooms: 0, nonEntry5x5Fraction: null });
  });
});
