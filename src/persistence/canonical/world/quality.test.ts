import { describe, expect, it } from 'vitest';
import { assertModuleQuality, moduleQuality, passesModuleStructuralQuality } from '../../../domain/expedition/topology/modules/quality';
import { advanceWorldFloorQuality, beginWorldFloorQuality, loadWorldQuality, requireWorldFloorQuality, reduceQualityTreeNode } from './quality';
import { beginWorldRoomRoles, advanceWorldRoomRoles } from './roles';
import { finishQuality, qualityFixture } from './quality.test-support';

describe('canonical full D1 structural qualification', () => {
  for (const joins of ['direct', 'mixed', 'passage'] as const) for (const seed of [0, 42, 781]) for (const count of [3, 7, 12, 25]) {
    it(`matches every structural metric and verdict: ${joins}/${seed}/${count}`, async () => {
      const m = qualityFixture(seed, count, joins), untouched = structuredClone([...m.rows]);
      const expected = moduleQuality(m.assembly);
      let passed = true;
      try { assertModuleQuality(m.assembly); } catch { passed = false; }
      let state = await beginWorldFloorQuality(m.pages, 1), batch = 0;
      while (state.status === 'running') {
        const before = state.nextRoom, limit = [1, 3, 4][batch++ % 3]; m.clear();
        state = await advanceWorldFloorQuality(m.pages, 1, limit);
        expect(before - state.nextRoom).toBe(Math.min(limit, before + 1));
        expect(m.reads.length).toBeLessThanOrEqual(160);
        expect(m.writes.length).toBeLessThanOrEqual(5);
        expect(m.writes.every(key => key.startsWith('dungeon/1/quality/'))).toBe(true);
        expect(JSON.stringify(state).length).toBeLessThan(2048);
        expect(await loadWorldQuality(m.pages, 1)).toEqual(state);
      }
      expect(state.metrics).toEqual({ rooms: expected.rooms, reachable: expected.reachable, joins: m.assembly.joins.length,
        forks: expected.forks, longestChain: expected.longestChain });
      expect(state.status).toBe(passed ? 'qualified' : 'failed');
      expect([...m.rows].filter(([key]) => !key.includes('/quality'))).toEqual(untouched);
      if (passed) expect(await requireWorldFloorQuality(m.pages, 1)).toEqual(state);
      else {
        await expect(requireWorldFloorQuality(m.pages, 1)).rejects.toThrow('not structurally qualified');
        await expect(beginWorldFloorQuality(m.pages, 1)).rejects.toThrow('failed structural');
        await expect(advanceWorldFloorQuality(m.pages, 1)).rejects.toThrow('failed structural');
      }
    });
  }

  it('does not confuse generation or roles-ready with qualification', async () => {
    const m = qualityFixture(); await beginWorldRoomRoles(m.pages, 1);
    for (let i = 0; i < 4; i++) await advanceWorldRoomRoles(m.pages, 1);
    expect(m.value('dungeon/1/roles').plan).not.toBeNull();
    await expect(requireWorldFloorQuality(m.pages, 1)).rejects.toThrow('quality has not begun');
    await beginWorldFloorQuality(m.pages, 1); await advanceWorldFloorQuality(m.pages, 1);
    await expect(requireWorldFloorQuality(m.pages, 1)).rejects.toThrow('not structurally qualified');
    expect((await finishQuality(m)).status).toBe('qualified');
  });

  it.each([0, -1, 1.5, 5, 100, NaN, Infinity])('rejects invalid batch limit %s without I/O', async limit => {
    const m = qualityFixture();
    await expect(advanceWorldFloorQuality(m.pages, 1, limit)).rejects.toThrow('limit');
    expect(m.reads).toEqual([]); expect(m.writes).toEqual([]);
  });

  it('shared thresholds include exact room count, connected tree, forks and chain boundary', () => {
    for (const count of [3, 6, 7, 11, 12, 25]) {
      const forks = count >= 12 ? 2 : count >= 7 ? 1 : 0;
      const q = { rooms: count, reachable: count, joins: count - 1, forks, longestChain: Math.ceil(count * 0.6) };
      expect(passesModuleStructuralQuality(q, count)).toBe(true);
      expect(passesModuleStructuralQuality(q, count + 1)).toBe(false);
      expect(passesModuleStructuralQuality({ ...q, reachable: count - 1 }, count)).toBe(false);
      expect(passesModuleStructuralQuality({ ...q, joins: count }, count)).toBe(false);
      expect(passesModuleStructuralQuality({ ...q, longestChain: q.longestChain + 1 }, count)).toBe(false);
      if (forks) expect(passesModuleStructuralQuality({ ...q, forks: forks - 1 }, count)).toBe(false);
    }
  });

  it('counts the whole chain through a degree-2 entry, not depth or average length', () => {
    const leaf = reduceQualityTreeNode(6, 1, []);
    const arm2 = reduceQualityTreeNode(4, 2, [leaf]);
    const arm3 = reduceQualityTreeNode(2, 2, [arm2]);
    const root = reduceQualityTreeNode(0, 2, [arm2, arm3]);
    expect(root.metrics).toEqual({ rooms: 6, reachable: 6, joins: 5, forks: 0, longestChain: 5 });
    expect(passesModuleStructuralQuality(root.metrics, 6)).toBe(false);
  });
});
