import { describe, expect, it } from 'vitest';
import { createModuleRecipe, moduleBudgetForLevel, validateModuleLimits, validateModuleRecipe } from '../expedition/topology/modules/policy';
import { assignModuleRoles } from './moduleRoles';

describe('D1 versioned module policy', () => {
  it('separates requested growth from finite projection limits without silently clamping', () => {
    expect([1, 20, 60, 200].map(moduleBudgetForLevel)).toEqual([8, 46, 126, 406]);
    expect(createModuleRecipe('world', 200, 42).roomBudget).toBe(406);
    for (const level of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER]) expect(() => moduleBudgetForLevel(level)).toThrow();
    expect(() => validateModuleLimits({ maxModules: 0, maxProjectionCells: 1 })).toThrow();
  });

  it('pins policy meaning and rejects unsupported or unsafe values', () => {
    const recipe = createModuleRecipe('world', 1, 42);
    expect(() => validateModuleRecipe(recipe)).not.toThrow();
    for (const patch of [{ version: 'spaces-v2' }, { seed: -1 }, { roomBudget: 2 }, { worldId: '' },
      { policy: { ...recipe.policy, maxSide: 512 } }, { policy: { ...recipe.policy, attempts: Infinity } }]) {
      expect(() => validateModuleRecipe({ ...recipe, ...patch } as typeof recipe)).toThrow();
    }
  });

  it.each([7, 8, 9, 11, 13, 32, 128, 256])('assigns total roles without multiplying special content for %i rooms', count => {
    const rooms = Array.from({ length: count }, (_, i) => ({
      id: `module-${i}`, row: i * 9, column: 0, rows: 9, columns: 9, center: { row: i * 9 + 4, column: 4 },
    }));
    const edges = rooms.slice(1).map((room, i) => ({ fromRoomId: rooms[Math.floor(i / 3)].id, toRoomId: room.id }));
    const assigned = assignModuleRoles(rooms, edges, 42);
    expect(assigned).toEqual(assignModuleRoles(rooms, edges, 42));
    expect(assigned.map(room => room.id)).toEqual(rooms.map(room => room.id));
    expect(assigned.every(room => room.name && Array.isArray(room.tags))).toBe(true);
    for (const kind of ['start', 'hub', 'exit', 'boss']) expect(assigned.filter(room => room.kind === kind)).toHaveLength(1);
    expect(assigned.filter(room => room.kind === 'treasure').length).toBeLessThanOrEqual(2);
    expect(assigned.filter(room => room.kind === 'safe').length).toBeLessThanOrEqual(2);
    expect(assigned.filter(room => room.kind === 'ordinary')).toHaveLength(Math.max(0, count - 8));
    expect(assigned.filter(room => room.kind === 'ordinary').every(room => room.tags.length === 0)).toBe(true);
  });
});
