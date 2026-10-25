// @vitest-environment node
import { expect, it } from 'vitest';
import { preparationMemory } from '../world/preparationCapacity.test-support';
import { loadFloor } from '../world/records';
import { preparationCapacity } from '../world/preparationCapacity';
import { STAIR_LAYOUT_VERSION } from '../../../domain/expedition/vertical';
import { projectSpatialView } from './spatialProjection';
import { MAX_STAIR_ROOMS, MAX_STAIR_ROOM_CELLS, spatialBinding } from '../../../services/game/SpatialView';
import type { WorldRead } from '../world/types';
import type { GameCheckpoint } from './checkpoint';
import { checkpointJson } from './checkpoint';
import type { CanonicalSnapshot } from '../types';
import type { ObservedCell } from '../knowledge/types';

it('publishes current and connected stair-room shells without content or navigational memory', async () => {
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
  const endpointPosition = structuredClone(c.position);
  c.position.cell.column++; snapshot.checkpoint = checkpointJson(c);
  const preparingFromRoom = (await project())!;
  expect(preparingFromRoom).toMatchObject({ prepareDown: true, connectors: [] });
  expect(preparingFromRoom.rooms!.map(room => room.id)).toEqual([`1/${floor.exit!.spaceId}`]);
  expect(preparingFromRoom.ports).toHaveLength(1);
  c.position = endpointPosition; snapshot.checkpoint = checkpointJson(c);
  await f.floor(2); reads.length = 0;
  const sight = (await project())!;
  expect(sight.version).toBe('stair-room-sight-v2'); expect(sight.binding).toBe(spatialBinding(snapshot));
  expect(sight.prepareDown).toBe(false); expect(sight.connectors).toHaveLength(1);
  expect(sight.connectors![0]).toMatchObject({ geometryReady: true, travelReady: true });
  expect(sight.rooms!.map(room => room.id).sort()).toEqual([`1/${floor.exit!.spaceId}`, '2/entry'].sort());
  expect(sight.rooms!.every(room => room.cells.length > 5 && room.cells.length <= 225)).toBe(true);
  expect(sight.rooms!.flatMap(room => room.cells).every(cell => !cell.chests.length && !cell.stairs.length)).toBe(true);
  expect(sight.rooms!.every(room => room.voids.length === 3 && room.voids.every(voidCell =>
    voidCell.floorOpen === (room.level === 1) && voidCell.ceilingOpen === (room.level === 2)))).toBe(true);
  expect(JSON.stringify(sight)).not.toMatch(/"seed"|"spec"|"rows"|"columns"|"inventory"/);
  expect(reads.every(k => k.startsWith('world/dungeon/') || k === 'world/dungeon' || k === 'world/game/preparation/2')).toBe(true);
  const admittedReads = [...reads]; expect(admittedReads.some(k => /chest|contract|roster|knowledge/.test(k))).toBe(false);
  await expect(project(true)).rejects.toThrow('missing established stair connection');
  // Room visibility, rather than standing on the endpoint, retains the adjoining room shell.
  const endpoint: ObservedCell = { at: structuredClone(c.position), world: { row: 0, column: 0 }, edges: {}, chests: [], stairs: ['down'] };
  c.position.cell = { ...c.position.cell, column: c.position.cell.column + 1 }; snapshot.checkpoint = checkpointJson(c);
  const before = structuredClone({ snapshot, c, endpoint }), records = [...f.records.values()];
  const fromRoom = (await project(false, [endpoint]))!;
  expect(fromRoom.rooms!.map(room => room.id).sort()).toEqual(sight.rooms!.map(room => room.id).sort());
  expect(fromRoom.connectors![0].travelReady).toBe(true);
  expect({ snapshot, c, endpoint }).toEqual(before); expect([...f.records.values()]).toEqual(records);
  // Actual retained writer costs include the indexed older-room rewrite.
  const { version, level, roomBudget, policy, spatial } = recipe;
  const cap = preparationCapacity({ version, level, roomBudget, policy, spatial });
  for (const [phase, bound] of Object.entries(cap.phases)) for (const kind of ['recordsBytes', 'nodesBytes', 'receiptsBytes'] as const)
    expect(f.measurements.filter(m => m.level === 1 && m.phase === phase).reduce((sum, m) => sum + m[kind], 0)).toBeLessThanOrEqual(bound[kind]);
  const terminal = f.measurements.filter(m => m.level === 1 && m.phase === 'generation').at(-1)!;
  expect(terminal.values.some(v => v.key === `dungeon/1/space/${floor.exit!.spaceId}`)).toBe(true);
});

it('publishes both visible source ports with only their directly connected rooms', async () => {
  const f = preparationMemory(781);
  await f.floor(1, { spatial: STAIR_LAYOUT_VERSION }); await f.floor(2); await f.floor(3); await f.floor(4);
  const floor = await f.read(p => loadFloor(p, 2));
  const c: GameCheckpoint = { schema: 1, kind: 'rpg', mode: 'manual', position: { level: 2, cell: floor.entry },
    knowledge: { sequence: 9, id: 'observation', witness: 'witness' }, facing: 'south', wave: 1,
    createdAt: '2026-10-24T00:00:00.000Z', updatedAt: '2026-10-24T00:00:00.000Z', activityLog: [] };
  const snapshot: CanonicalSnapshot = { generation: 'generation', gameId: 'game', revision: 20,
    checkpoint: checkpointJson(c), roots: { world: 'world-root', knowledge: 'knowledge-root', execution: null } };
  const observed: ObservedCell[] = [
    { at: structuredClone(c.position), world: { row: 0, column: 0 }, edges: {}, chests: [{ id: 'visible-chest', opened: false }], stairs: ['up'] },
    { at: { level: 2, cell: structuredClone(floor.exit!) }, world: { row: 20, column: 20 }, edges: {}, chests: [], stairs: ['down'] },
  ];
  const before = structuredClone({ snapshot, c, observed }), records = [...f.records.values()], reads: string[] = [];
  const result = await f.read(p => projectSpatialView({
    get: async (area, key) => { reads.push(`${area}/${key}`); return p.get(area, key); },
    scan: async () => { throw Error('Room sight must not scan'); },
  }, snapshot, c, observed));
  expect(result!.ports).toHaveLength(2); expect(result!.connectors).toHaveLength(2);
  expect(result!.connectors!.every(connector => connector.geometryReady && connector.travelReady)).toBe(true);
  const upper = await f.read(p => loadFloor(p, 1));
  const expectedRooms = [`1/${upper.exit!.spaceId}`, '2/entry', `2/${floor.exit!.spaceId}`, '3/entry'].sort();
  expect(result!.rooms!.map(room => room.id).sort()).toEqual(expectedRooms);
  expect(new Set(result!.rooms!.map(room => room.id)).size).toBe(result!.rooms!.length);
  expect(result!.rooms!.length).toBeLessThanOrEqual(MAX_STAIR_ROOMS);
  expect(result!.rooms!.reduce((sum, room) => sum + room.cells.length, 0)).toBeLessThanOrEqual(MAX_STAIR_ROOM_CELLS);
  expect(result!.connector!.lower).toEqual(c.position);
  const spaceReads = new Set(reads.filter(key => /^world\/dungeon\/\d+\/space\//.test(key))
    .map(key => key.replace(/^world\/dungeon\/(\d+)\/space\//, '$1/')));
  expect([...spaceReads].sort()).toEqual(expectedRooms);
  expect(reads.some(key => /^world\/dungeon\/4(?:\/|$)|^world\/dungeon\/3\/stairs$/.test(key))).toBe(false);
  expect(reads.some(key => /knowledge|content|chest|contract|roster/.test(key))).toBe(false);
  expect({ snapshot, c, observed }).toEqual(before); expect([...f.records.values()]).toEqual(records);
});

it('discloses no stair rooms when neither source room is current nor visible', async () => {
  const f = preparationMemory(42); await f.floor(1, { spatial: STAIR_LAYOUT_VERSION }); await f.floor(2);
  const floor = await f.read(p => loadFloor(p, 1));
  const c: GameCheckpoint = { schema: 1, kind: 'rpg', mode: 'manual', position: { level: 1, cell: floor.entry },
    knowledge: { sequence: 1, id: 'observation', witness: 'witness' }, facing: 'north', wave: 1,
    createdAt: '2026-10-24T00:00:00.000Z', updatedAt: '2026-10-24T00:00:00.000Z', activityLog: [] };
  const snapshot: CanonicalSnapshot = { generation: 'generation', gameId: 'game', revision: 1,
    checkpoint: checkpointJson(c), roots: { world: 'world-root', knowledge: 'knowledge-root', execution: null } };
  const reads: string[] = [];
  const result = await f.read(p => projectSpatialView({ get: async (area, key) => {
    reads.push(`${area}/${key}`); return p.get(area, key);
  }, scan: async () => { throw Error('Unexpected scan'); } }, snapshot, c, []));
  expect(result).toMatchObject({ prepareDown: false, rooms: [], ports: [], connectors: [] });
  expect(result!.connector).toBeUndefined(); expect(reads.some(key => /\/stairs$|\/space\//.test(key))).toBe(false);
});

it('keeps established structural rooms visible while target preparation is unfinished', async () => {
  const f = preparationMemory(42); await f.floor(1, { spatial: STAIR_LAYOUT_VERSION }); await f.floor(2);
  const floor = await f.read(p => loadFloor(p, 1));
  const c: GameCheckpoint = { schema: 1, kind: 'rpg', mode: 'manual', position: { level: 1, cell: floor.exit! },
    knowledge: { sequence: 1, id: 'observation', witness: 'witness' }, facing: 'north', wave: 1,
    createdAt: '2026-10-24T00:00:00.000Z', updatedAt: '2026-10-24T00:00:00.000Z', activityLog: [] };
  const snapshot: CanonicalSnapshot = { generation: 'generation', gameId: 'game', revision: 1,
    checkpoint: checkpointJson(c), roots: { world: 'world-root', knowledge: 'knowledge-root', execution: null } };
  const result = await f.read(p => projectSpatialView({ get: async (area, key) => {
    const row = await p.get(area, key);
    return row && key === 'game/preparation/2' ? { ...row, value: { schema: 1, level: 2, phase: 'generation' } } : row;
  }, scan: async () => { throw Error('Unexpected scan'); } }, snapshot, c));
  expect(result).toMatchObject({ prepareDown: true, connectors: [{ geometryReady: true, travelReady: false }] });
  expect(result!.rooms).toHaveLength(2);
  expect(result!.rooms!.find(room => room.level === 2)!.cells.length).toBeGreaterThan(5);
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
