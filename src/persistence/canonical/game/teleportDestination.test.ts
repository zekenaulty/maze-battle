import { afterEach, describe, expect, it, vi } from 'vitest';
import { createModuleRecipe } from '../../../domain/expedition/topology/modules/policy';
import { mechanicsFixture } from '../combat/mechanics.test-support';
import { json, loadFloor } from '../world/records';
import { loadWorldRoom } from '../world/residency';
import type { WorldRead, WorldSpace } from '../world/types';
import { gameCheckpoint } from './checkpoint';
import { teleportDestinations } from './teleportDestination';

afterEach(() => vi.restoreAllMocks());
describe('bounded actual-geometry Teleport selection', () => {
  it.each(['entry', 'exit'])('excludes the current cell and %s stairs without scanning or visiting other spaces', async anchor => {
    const f = await mechanicsFixture(), floor = await f.floor(), spaceId = anchor === 'entry' ? 'entry' : floor.exit!.spaceId;
    await f.atRoom(spaceId); const origin = gameCheckpoint(f.head().checkpoint).position, captured = structuredClone(origin);
    await f.read(async pages => {
      const room = await loadWorldRoom(pages, 1, spaceId), reads: string[] = [];
      const allowed = new Set(['dungeon', 'dungeon/1', `dungeon/1/space/${spaceId}`, `dungeon/1/ports/${spaceId}`,
        ...room.ports.connections.map(id => `dungeon/1/connection/${id}`)]);
      const restricted: WorldRead = {
        async get(area, key) { expect(area).toBe('world'); expect(allowed.has(key)).toBe(true); reads.push(key); return pages.get(area, key); },
        async scan() { throw Error('Teleport must not scan the world'); },
      };
      const pending = teleportDestinations(restricted, origin); origin.cell.row = 500; origin.level = 99;
      const choices = await pending;
      expect(choices.length).toBeGreaterThan(0); expect(choices.length).toBeLessThanOrEqual(511); expect(reads.length).toBeLessThanOrEqual(9);
      for (const choice of choices) {
        expect(choice.level).toBe(captured.level); expect(choice.cell.spaceId).toBe(spaceId);
        expect(choice).not.toEqual(captured); expect(choice.cell).not.toEqual(floor.entry); expect(choice.cell).not.toEqual(floor.exit);
        expect(room.geometry.cells.some(c => c.row === choice.cell.row && c.column === choice.cell.column && c.links.length > 0)).toBe(true);
      }
    });
  });

  it('supports the maximal 512-cell local schematic and empty candidates, with no global-floor projection', async () => {
    const f = await mechanicsFixture();
    await f.read(async pages => {
      const base = (await pages.get('world', 'dungeon/1/space/entry'))!, floorRow = (await pages.get('world', 'dungeon/1'))!;
      const floor = await loadFloor(pages, 1), spec = (base.value as unknown as WorldSpace).spec;
      for (const size of [{ rows: 1, columns: 512 }, { rows: 1, columns: 1 }]) {
        const reader: WorldRead = { async get(area, key) {
          if (key === base.key) return { ...base, value: json({ ...(base.value as object), spec: { ...spec, ...size, kind: 'passage' } }) };
          if (key === floorRow.key) return { ...floorRow, value: json({ ...floor, entry: { spaceId: 'entry', row: 0, column: 0 } }) };
          if (key === 'dungeon/1/ports/entry') return { ...base, key, value: { schema: 1, level: 1, spaceId: 'entry', connections: [], pending: [] } };
          return pages.get(area, key);
        }, async scan() { throw Error('Unexpected scan'); } };
        const choices = await teleportDestinations(reader, { level: 1, cell: { spaceId: 'entry', row: 0, column: 0 } });
        expect(choices.length).toBe(size.columns - 1);
      }
    });
  });

  it('does not hard-code floor one', async () => {
    const f = await mechanicsFixture();
    await f.read(async pages => {
      const room = await loadWorldRoom(pages, 1, 'entry'), recipe = createModuleRecipe('combat-test', 12, 781), level = 12;
      const floor = await loadFloor(pages, 1), generation = { ...floor.generation, recipe, scopeId: JSON.stringify(recipe) };
      const reader: WorldRead = { async get(area, key) {
        if (key === 'dungeon') return pages.get(area, key);
        if (key === 'dungeon/12') return { ...(await pages.get(area, 'dungeon/1'))!, key,
          value: json({ ...floor, level, generation, exit: null }) };
        if (key === 'dungeon/12/space/entry') return { ...(await pages.get(area, 'dungeon/1/space/entry'))!, key, value: json({ ...room.space, level }) };
        if (key === 'dungeon/12/ports/entry') return { ...(await pages.get(area, 'dungeon/1/ports/entry'))!, key,
          value: { schema: 1, level, spaceId: 'entry', connections: [], pending: [] } };
        throw Error(`Unexpected world read ${key}`);
      }, async scan() { throw Error('Unexpected scan'); } };
      const choices = await teleportDestinations(reader, { level, cell: floor.entry });
      expect(choices.length).toBeGreaterThan(0); expect(choices.every(at => at.level === level)).toBe(true);
    });
  });

  it.each(['origin', 'dimensions', 'identity'] as const)('fails closed on invalid %s rather than returning invented candidates', async defect => {
    const f = await mechanicsFixture();
    await f.read(async pages => {
      const reader: WorldRead = { async get(area, key) {
        const record = await pages.get(area, key);
        if (key !== 'dungeon/1/space/entry' || defect === 'origin') return record;
        const value = structuredClone(record!.value) as unknown as WorldSpace;
        if (defect === 'dimensions') { value.spec.rows = 513; value.spec.columns = 1; }
        else value.spec.id = 'foreign';
        return { ...record!, value: json(value) };
      }, async scan() { throw Error('Unexpected scan'); } };
      const origin = gameCheckpoint(f.head().checkpoint).position;
      if (defect === 'origin') origin.cell.row = 500;
      await expect(teleportDestinations(reader, origin)).rejects.toThrow();
    });
  });
});
