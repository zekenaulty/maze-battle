// @vitest-environment node
import { expect, it } from 'vitest';
import { preparationMemory } from '../world/preparationCapacity.test-support';
import { loadFloor } from '../world/records';
import { preparationCapacity } from '../world/preparationCapacity';
import { STAIR_LAYOUT_VERSION } from '../../../domain/expedition/vertical';
import { projectSpatialView } from './spatialProjection';
import type { WorldRead } from '../world/types';
import type { GameCheckpoint } from './checkpoint';
import { checkpointJson } from './checkpoint';
import type { CanonicalSnapshot } from '../types';
import type { ObservedCell } from '../knowledge/types';

it('publishes only admitted linked landing geometry, never content or navigational memory', async () => {
  const f = preparationMemory(42), recipe = await f.floor(1, { spatial: STAIR_LAYOUT_VERSION });
  const floor = await f.read(p => loadFloor(p, 1));
  const c: GameCheckpoint = { schema: 1, kind: 'rpg', mode: 'manual', position: { level: 1, cell: floor.exit! },
    knowledge: { sequence: 1, id: 'observation', witness: 'witness' }, facing: 'north', wave: 1,
    createdAt: '2026-10-24T00:00:00.000Z', updatedAt: '2026-10-24T00:00:00.000Z', activityLog: [] };
  const snapshot: CanonicalSnapshot = { generation: 'generation', gameId: 'game', revision: 1,
    checkpoint: checkpointJson(c), roots: { world: 'world-root', knowledge: 'knowledge-root', execution: null } };
  const reads: string[] = [];
  const project = (missing = false, observed: ObservedCell[] = []) => f.read(p => projectSpatialView({
    get: async (area, key) => { reads.push(`${area}/${key}`); if (missing && key === 'dungeon/1/stairs') return undefined; return p.get(area, key); },
    scan: async () => { throw Error('Unbounded sight scan'); },
  } as WorldRead, snapshot, c, observed));
  expect((await project())?.prepareDown).toBe(true); expect(reads.some(k => k.startsWith('world/dungeon/2'))).toBe(false);
  await f.floor(2); reads.length = 0;
  const sight = (await project())!;
  expect(sight.prepareDown).toBe(false); expect(sight.connector!.cells.length).toBeGreaterThan(0);
  expect(sight.connector!.cells.length).toBeLessThanOrEqual(5);
  expect(sight.connector!.cells.every(cell => !cell.chests.length && !cell.stairs.length && cell.at.level === 2)).toBe(true);
  expect(JSON.stringify(sight)).not.toMatch(/"seed"|"spec"|"rows"|"columns"|"inventory"/);
  expect(reads.every(k => k.startsWith('world/dungeon/') || k === 'world/dungeon' || k === 'world/game/preparation/2')).toBe(true);
  const admittedReads = [...reads]; expect(admittedReads.some(k => /chest|contract|roster|knowledge/.test(k))).toBe(false);
  await expect(project(true)).rejects.toThrow('missing established stair connection');
  // Seeing the source endpoint retains the assembly, but earns no target cells before admission.
  const endpoint: ObservedCell = { at: structuredClone(c.position), world: { row: 0, column: 0 }, edges: {}, chests: [], stairs: ['down'] };
  c.position.cell = { ...c.position.cell, column: c.position.cell.column + 1 }; snapshot.checkpoint = checkpointJson(c);
  expect((await project(false, [endpoint]))!.connector!.cells).toEqual([]);
  // Actual retained writer costs include the indexed older-room rewrite.
  const { version, level, roomBudget, policy, spatial } = recipe;
  const cap = preparationCapacity({ version, level, roomBudget, policy, spatial });
  for (const [phase, bound] of Object.entries(cap.phases)) for (const kind of ['recordsBytes', 'nodesBytes', 'receiptsBytes'] as const)
    expect(f.measurements.filter(m => m.level === 1 && m.phase === phase).reduce((sum, m) => sum + m[kind], 0)).toBeLessThanOrEqual(bound[kind]);
  const terminal = f.measurements.filter(m => m.level === 1 && m.phase === 'generation').at(-1)!;
  expect(terminal.values.some(v => v.key === `dungeon/1/space/${floor.exit!.spaceId}`)).toBe(true);
});
it.each([42, 781])('replays seeded spatial floor geometry, ports and placement exactly: %s', async seed => {
  const transcripts: unknown[] = []; let rewroteOlder = false;
  for (let repeat = 0; repeat < 2; repeat++) {
    const f = preparationMemory(seed);
    await f.floor(1, { spatial: STAIR_LAYOUT_VERSION }); await f.floor(2);
    const current = new Map([...f.records.values()].map(r => [r.key, r.value]));
    transcripts.push([...current].filter(([key]) => /^dungeon\/[12](\/stairs)?$|^dungeon\/[12]\/(space|ports|connection|join)\//.test(key))
      .sort(([a], [b]) => a.localeCompare(b)));
    for (const level of [1, 2]) {
      const floor = await f.read(p => loadFloor(p, level));
      const terminal = f.measurements.filter(m => m.level === level && m.phase === 'generation').at(-1)!;
      const old = floor.exit!.spaceId !== `socket-${floor.generation.recipe.roomBudget - 2}:room`;
      if (old) { rewroteOlder = true; expect(terminal.values.some(v => v.key === `dungeon/${level}/space/${floor.exit!.spaceId}`)).toBe(true); }
    }
  }
  expect(transcripts[0]).toEqual(transcripts[1]); expect(rewroteOlder).toBe(true);
});
