// @vitest-environment node
import { expect, it } from 'vitest';
import { ceilingTimbers } from './timber';
import { masonrySurfaces } from './masonry';
import { stairFaceFinishes, STAIR_BANDS } from './stairFinish';
import { DEFAULT_ARCHITECTURE, roomSupports } from './supports';
import { cabinetClearance, cabinetVisible } from './cabinetInteraction';
import type { SceneBox } from './scene';
import { stageFixture } from './stage.test-support';
import { compileStageScene } from './scene';
import { fitCabinetDoors } from '../../assets3d/models/cabinet';
import type { VisualAsset } from '../../assets3d/models/contract';
const box = (id: string, center: [number, number, number], size: [number, number, number]): SceneBox => ({ id, material: 'stone_bricks', center, size, solid: true });
it('closes the cabinet overlay gap once, preserving source geometry, UVs and hinge separation', () => {
  const source = { payload: { geometries: { main: [
    { id: 'side-left-sides', mesh: { positions: [[0, 0, -.32], [0, 0, .192]] } },
    { id: 'door-left-sides', mesh: { positions: [[0, 0, -.0224], [0, 0, .0224]], uvs: [[0, 0], [1, 1]] } },
    { id: 'hinge-left', position: [-.8, .1, .2576] }, { id: 'hinge-right', position: [.8, .1, .2576] },
  ] } } } as unknown as VisualAsset;
  const before = structuredClone(source), fixed = fitCabinetDoors(source);
  expect(fixed.offset).toBeCloseTo(-.0432); expect(source).toEqual(before);
  expect(fixed.asset.payload.geometries.main.slice(0, 2)).toEqual(source.payload.geometries.main.slice(0, 2));
  expect(fixed.asset.payload.geometries.main[2].position).toEqual([-.8, .1, .2144]);
  expect(fitCabinetDoors(fixed.asset).offset).toBeCloseTo(0);
});
it('caps convex trim corners with positive bearing instead of two exposed ends facing a gap', () => {
  const roof: SceneBox = { ...box('roof', [0, 4.89, 0], [12.8, .18, 12.8]), deck: 'ceiling', textureOrigin: [0, 0, 0] };
  const members = ceilingTimbers([roof, box('pillar', [0, 2.4, 0], [3.2, 4.8, 3.2])]).filter(m => m.role === 'trim');
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const point = [x * 1.696, 4.3, z * 1.696];
    expect(members.filter(m => point.every((v, i) => v > m.min[i] - 1e-6 && v < m.max[i] + 1e-6))).toHaveLength(1);
  }
});
it('partitions actual exposed stair faces without adding area, overlapping polygons or changing the walking surface', () => {
  const step = { ...box('flight/step/0', [0, .138333333, 0], [1.8, .276666666, .433333333]), material: 'cobblestone' };
  const area = (g: ReturnType<typeof masonrySurfaces>[number]) => {
    const p = g.getAttribute('position'), idx = g.index!; let sum = 0;
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2), u = [p.getX(b) - p.getX(a), p.getY(b) - p.getY(a), p.getZ(b) - p.getZ(a)], v = [p.getX(c) - p.getX(a), p.getY(c) - p.getY(a), p.getZ(c) - p.getZ(a)];
      sum += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
    } return sum;
  };
  const original = masonrySurfaces([step])[0], before = area(original), finishes = stairFaceFinishes(step, original, { ...DEFAULT_ARCHITECTURE, dressedRisers: true, ironNosing: true });
  expect(finishes.map(f => f.role).sort()).toEqual(['base', 'metal', 'riser']); expect(finishes.reduce((n, f) => n + area(f.geometry), 0)).toBeCloseTo(before, 5);
  for (const f of finishes) {
    const n = f.geometry.getAttribute('normal'), uv = f.geometry.getAttribute('uv');
    if (f.role !== 'base') for (let i = 0; i < n.count; i++) { expect(n.getZ(i)).toBe(-1); const band = STAIR_BANDS[f.role]; expect(uv.getX(i)).toBeGreaterThanOrEqual(band[0] - 1e-6); expect(uv.getY(i)).toBeLessThanOrEqual(band[3] + 1e-6); }
    f.geometry.dispose();
  }
});
it('reserves cabinet leaf sweeps for the player and neighboring props, and refuses interaction through masonry', () => {
  const cabinet: SceneBox = { ...box('cabinet', [0, .88, 0], [1.76, 1.76, .64]), material: 'bookshelf', furnishing: 'cabinet', facing: 'south' };
  expect(cabinetClearance(cabinet, [cabinet], { x: 0, z: .8 }, 0)).toContain('Step back');
  expect(cabinetClearance(cabinet, [cabinet], { x: 0, z: 1.7 }, 0)).toBeUndefined();
  expect(cabinetClearance(cabinet, [cabinet, box('obstacle', [.5, .5, .8], [.2, 1, .2])], { x: 0, z: 1.7 }, 0)).toContain('clearance');
  expect(cabinetVisible({ x: 0, z: 2 }, { x: 0, z: .34 }, 0, [box('wall', [0, 1, 1.2], [2, 2, .16])], cabinet.id)).toBe(false);
  expect(cabinetVisible({ x: 0, z: 2 }, { x: 0, z: .34 }, 0, [cabinet], cabinet.id)).toBe(true);
});
it('keeps optional supports absent by default and avoids filling a tiny room with posts', async () => {
  const { game } = await stageFixture(), scene = compileStageScene(game)!;
  expect(roomSupports(scene, DEFAULT_ARCHITECTURE, scene.actor.center)).toEqual([]);
  expect(roomSupports(scene, { ...DEFAULT_ARCHITECTURE, cornerPosts: true }, scene.actor.center)).toEqual([]);
});
