// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { STAIR_LAYOUT_VERSION, stairReservedCells } from '../../../domain/expedition/vertical';
import { preparationMemory } from '../world/preparationCapacity.test-support';
import { loadFloor, same } from '../world/records';
import { loadPlacedStairs } from '../world/placedStairs';
import { loadWorldRoom } from '../world/residency';
import type { WorldPosition, WorldRead } from '../world/types';
import { teleportDestinations } from './teleportDestination';

let fixture: ReturnType<typeof preparationMemory>;
beforeAll(async () => {
  fixture = preparationMemory(42);
  await fixture.floor(1, { spatial: STAIR_LAYOUT_VERSION }); await fixture.floor(2);
});

describe('Teleport in canonically placed stair rooms', () => {
  it.each(['upper', 'lower'] as const)('keeps %s-room destinations on this floor and outside the reserved shaft and endpoints', async end => {
    const retained = structuredClone([...fixture.records.values()]);
    await fixture.read(async pages => {
      const placed = await loadPlacedStairs(pages, 1), anchor = placed.stairs[end];
      const floor = await loadFloor(pages, anchor.level), room = await loadWorldRoom(pages, anchor.level, anchor.cell.spaceId);
      expect(room.space.stairwell?.end).toBe(end);
      const reserved = stairReservedCells(room.space.spec, room.space.stairwell!);
      expect(reserved).toHaveLength(3);
      expect(reserved.every(at => !room.geometry.cells.some(cell => cell.row === at.row && cell.column === at.column))).toBe(true);
      const neighbor = room.geometry.cells.find(cell => cell.links.length > 0
        && (cell.row !== anchor.cell.row || cell.column !== anchor.cell.column))!;
      const origins: WorldPosition[] = [anchor,
        { level: anchor.level, cell: { spaceId: anchor.cell.spaceId, row: neighbor.row, column: neighbor.column } }];
      const allowed = new Set(['dungeon', `dungeon/${anchor.level}`, `dungeon/${anchor.level}/space/${anchor.cell.spaceId}`,
        `dungeon/${anchor.level}/ports/${anchor.cell.spaceId}`,
        ...room.ports.connections.map(id => `dungeon/${anchor.level}/connection/${id}`)]);
      for (const origin of origins) {
        const reads: string[] = [], captured = structuredClone(origin);
        const restricted: WorldRead = {
          async get(area, key) { expect(area).toBe('world'); expect(allowed.has(key)).toBe(true); reads.push(key); return pages.get(area, key); },
          async scan() { throw Error('Teleport must not scan or follow the connected stair-room preview'); },
        };
        const choices = await teleportDestinations(restricted, origin);
        expect(choices.length).toBeGreaterThan(0); expect(choices.length).toBeLessThan(room.geometry.cells.length);
        expect(reads.length).toBeLessThanOrEqual(9); expect(origin).toEqual(captured);
        for (const choice of choices) {
          expect(choice.level).toBe(anchor.level); expect(choice.cell.spaceId).toBe(anchor.cell.spaceId);
          expect(same(choice, origin)).toBe(false);
          expect(same(choice.cell, floor.entry)).toBe(false); expect(same(choice.cell, floor.exit)).toBe(false);
          expect(reserved.some(at => at.row === choice.cell.row && at.column === choice.cell.column)).toBe(false);
          expect(room.geometry.cells.some(cell => cell.row === choice.cell.row && cell.column === choice.cell.column && cell.links.length > 0)).toBe(true);
        }
      }
    });
    expect([...fixture.records.values()]).toEqual(retained);
  });

  it.each(['upper', 'lower'] as const)('refuses an invented origin in the %s reserved shaft', async end => {
    await fixture.read(async pages => {
      const placed = await loadPlacedStairs(pages, 1), anchor = placed.stairs[end];
      const room = await loadWorldRoom(pages, anchor.level, anchor.cell.spaceId);
      const [reserved] = stairReservedCells(room.space.spec, room.space.stairwell!);
      await expect(teleportDestinations(pages, { level: anchor.level, cell: { spaceId: anchor.cell.spaceId, ...reserved } }))
        .rejects.toThrow('teleport origin is not walkable');
    });
  });
});
