import type { ExpeditionCheckpoint, ExpeditionPlan, SpaceGeometry, SpaceSpec } from './types';
import { addressKey } from './address';

export function testSpace(id = 'room-a', rows = 2, columns = 2): SpaceSpec {
  return { id, kind: 'room', name: id, origin: { row: 0, column: 0 }, rows, columns, seed: 42, openings: [], chests: [] };
}

export function testGeometry(spec: SpaceSpec): SpaceGeometry {
  return {
    spaceId: spec.id, rows: spec.rows, columns: spec.columns,
    cells: Array.from({ length: spec.rows * spec.columns }, (_, index) => ({
      row: Math.floor(index / spec.columns), column: index % spec.columns, links: [],
    })),
  };
}

export function storageFixture(): { plan: ExpeditionPlan; checkpoint: ExpeditionCheckpoint } {
  const a = testSpace();
  const b = testSpace('room-b', 2, 3);
  const start = { spaceId: a.id, row: 0, column: 0 };
  const chest = { id: 'chest-a', cell: { row: 1, column: 1 } };
  a.chests.push(chest);
  a.openings.push({ id: 'a-b', cell: { row: 0, column: 1 }, direction: 'east', destination: { spaceId: b.id, row: 0, column: 0 } });
  b.openings.push({ id: 'b-a', cell: { row: 0, column: 0 }, direction: 'west', destination: { spaceId: a.id, row: 0, column: 1 } });
  const plan: ExpeditionPlan = {
    recipe: { version: 'spaces-v1', worldId: 'world-42', floorId: 'floor-1', level: 1, seed: 42 },
    scopeId: 'finite-fixture', spaces: [a, b], start,
  };
  const checkpoint: ExpeditionCheckpoint = {
    version: 1, worldId: plan.recipe.worldId, floorId: plan.recipe.floorId, scopeId: plan.scopeId,
    revision: 0, position: { ...start }, home: { ...start }, openedChestIds: ['chest-a'],
    knowledge: {
      cells: { [addressKey(start)]: { ...start, links: ['east'], observedAt: 0 } },
      openings: { 'a-b': { spaceId: a.id, row: 0, column: 1, id: 'a-b', direction: 'east', observedAt: 0 } },
      chests: { 'chest-a': { spaceId: a.id, ...chest.cell, id: chest.id, opened: true, observedAt: 0 } },
    },
    phase: 'exploring', moves: 0,
  };
  return { plan, checkpoint };
}
