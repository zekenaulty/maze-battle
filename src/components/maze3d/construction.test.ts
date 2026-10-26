// @vitest-environment node
import { expect, it } from 'vitest';
import { alignedLowerFrame, floorPoint, type FloorFrame } from '../../domain/expedition/vertical';
import { constructionOffset, masonryUV, type TextureOrigin } from './construction';
import { masonrySurfaces } from './masonry';
import { type SceneBox, type StageFlight, stairEnclosure } from './scene';
import { stageBoxGeometry } from './surfaces';
import { compileStageScene } from './scene';
import { stageFixture } from './stage.test-support';
import { earnedCell } from '../../persistence/canonical/knowledge/region.test-support';

it('aligns old placed floors to a three-cell construction grid through descent, ascent and a changed render origin', () => {
  const frames: FloorFrame[] = [[0, 0, 0]];
  const upper = { row: 13, column: -7 }, lower = { row: -3, column: 5 };
  for (let i = 0; i < 12; i++) frames.push(alignedLowerFrame(frames.at(-1)!, upper, lower));
  for (const origin of [frames[0], frames[7], frames[12]]) for (let i = 1; i < frames.length; i++) {
    const a = constructionOffset(frames[i - 1], origin), b = constructionOffset(frames[i], origin);
    expect(a[0] + upper.column * 3.2).toBeCloseTo(b[0] + lower.column * 3.2);
    expect(a[2] + upper.row * 3.2 - b[2] - lower.row * 3.2).toBeCloseTo(9.6);
    expect(a[1] - b[1]).toBeCloseTo(4.98);
    for (const p of [a, b]) for (const axis of [0, 2]) expect(p[axis] / 3.2).toBeCloseTo(Math.round(p[axis] / 3.2));
  }
  // The original persisted construction contract is unchanged.
  const canonicalA = floorPoint(frames[0], upper), canonicalB = floorPoint(frames[1], lower);
  expect(canonicalA[1] - canonicalB[1]).toBeCloseTo(4.68); expect(canonicalA[2] - canonicalB[2]).toBeCloseTo(9.36);
});

it('anchors full wall courses and two-by-two floor repeats at translated floor datums on every face', () => {
  for (const origin of [[-1.6, 0, -1.6], [12.125, -14.94, -31.875]] as TextureOrigin[]) {
    const wall: SceneBox = { id: 'wall', material: 'stone_bricks', center: [origin[0] + 1.6, origin[1] + 2.4, origin[2]],
      size: [3.2, 4.8, .16], solid: true, textureOrigin: origin };
    const floor: SceneBox = { ...wall, id: 'floor', deck: 'floor', material: 'cobblestone',
      center: [origin[0] + 1.6, origin[1] - .09, origin[2] + 1.6], size: [3.2, .18, 3.2] };
    for (const geometry of [masonrySurfaces([wall])[0], stageBoxGeometry(wall, true)]) {
      const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
      const side = Array.from({ length: p.count }, (_, i) => i).filter(i => n.getY(i) === 0);
      expect(Math.min(...side.map(i => uv.getY(i)))).toBeCloseTo(0, 5);
      expect(Math.max(...side.map(i => uv.getY(i)))).toBeCloseTo(3, 5); geometry.dispose();
    }
    const [geometry] = masonrySurfaces([floor]), n = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
    const top = Array.from({ length: n.count }, (_, i) => i).filter(i => n.getY(i) === 1);
    expect(Math.min(...top.map(i => uv.getX(i)))).toBeCloseTo(0); expect(Math.max(...top.map(i => uv.getX(i)))).toBeCloseTo(2);
    expect(Math.min(...top.map(i => uv.getY(i)))).toBeCloseTo(-2); expect(Math.max(...top.map(i => uv.getY(i)))).toBeCloseTo(0); geometry.dispose();
  }
});

it('preserves exact surface phase when rebasing the renderer and clipping a floor against its wall', () => {
  const boxes: SceneBox[] = [
    { id: 'floor', deck: 'floor', material: 'cobblestone', center: [0, -.09, 0], size: [3.2, .18, 3.2], solid: false, textureOrigin: [-1.6, 0, -1.6] },
    { id: 'wall', material: 'stone_bricks', center: [0, 2.4, -1.6], size: [3.36, 4.8, .16], solid: true, textureOrigin: [-1.6, 0, -1.6] },
  ];
  const offset = [52.125, -4.98, -13.875], moved = boxes.map(box => ({ ...box,
    center: box.center.map((n, i) => n + offset[i]) as TextureOrigin,
    textureOrigin: box.textureOrigin!.map((n, i) => n + offset[i]) as TextureOrigin }));
  const a = masonrySurfaces(boxes), b = masonrySurfaces(moved);
  for (let i = 0; i < a.length; i++) {
    const ua = [...a[i].getAttribute('uv').array], ub = [...b[i].getAttribute('uv').array]; expect(ub).toHaveLength(ua.length);
    ua.forEach((n, j) => expect(ub[j]).toBeCloseTo(n, 5)); a[i].dispose(); b[i].dispose();
  }
});

it('joins both storeys to the stair enclosure on full courses and matches the upper tread to its floor grid', () => {
  const upper: TextureOrigin = [-1.6, 0, -1.6], lower: TextureOrigin = [-1.6, -4.98, -11.2];
  const flight: StageFlight = { id: 'construction', upper: { x: 0, y: 0, z: 0 }, lower: { x: 0, y: -4.98, z: -9.6 }, textureOrigins: { upper, lower } };
  const boxes = stairEnclosure(flight);
  for (const band of [0, 2]) for (const sign of [-1, 1]) {
    const wall = boxes.find(b => b.id.endsWith(`/side/${sign}/${band}`))!, [geometry] = masonrySurfaces([wall]);
    const n = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv'), side = Array.from({ length: n.count }, (_, i) => i).filter(i => n.getY(i) === 0);
    expect(Math.min(...side.map(i => uv.getY(i)))).toBeCloseTo(0, 5); expect(Math.max(...side.map(i => uv.getY(i)))).toBeCloseTo(3, 5); geometry.dispose();
  }
  const tread = boxes.find(b => b.id.endsWith('/step/17'))!, point = [0, 0, -.9];
  expect(masonryUV(point, [0, 1, 0], tread.textureOrigin)).toEqual(masonryUV(point, [0, 1, 0], upper));
  const lowerPhase = masonryUV(point, [0, 1, 0], lower), upperPhase = masonryUV(point, [0, 1, 0], upper);
  for (const axis of [0, 1]) expect(lowerPhase[axis] - upperPhase[axis]).toBeCloseTo(Math.round(lowerPhase[axis] - upperPhase[axis]));
});

it('uses uniform wall centerlines and supports their full thickness while cutting floor finishes at the inside faces', async () => {
  const { game } = await stageFixture(); game.observation!.cells = [game.observation!.cells[0]];
  game.observation!.cells[0].edges = { north: null, east: null, south: null, west: null };
  const scene = compileStageScene(game)!, boxes = scene.boxes.filter(b => b.deck || b.id.endsWith('/wall'));
  const geometries = masonrySurfaces(boxes);
  for (const deck of ['floor', 'ceiling'] as const) {
    const i = boxes.findIndex(b => b.deck === deck), box = boxes[i], geometry = geometries[i];
    expect(box.size[0]).toBeCloseTo(3.36); expect(box.size[2]).toBeCloseTo(3.36);
    const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
    const visible = Array.from({ length: n.count }, (_, i) => i).filter(i => n.getY(i) === (deck === 'floor' ? 1 : -1));
    for (const axis of [0, 2]) {
      expect(Math.min(...visible.map(i => p.getComponent(i, axis)))).toBeCloseTo(-1.52);
      expect(Math.max(...visible.map(i => p.getComponent(i, axis)))).toBeCloseTo(1.52);
    }
    expect(Math.min(...visible.map(i => uv.getX(i)))).toBeCloseTo(0); expect(Math.max(...visible.map(i => uv.getX(i)))).toBeCloseTo(1.9);
  }
  for (const direction of ['north', 'east', 'south', 'west']) {
    const wall = boxes.find(b => b.id.endsWith('/' + direction + '/wall'))!, axis = direction === 'north' || direction === 'south' ? 2 : 0;
    expect(Math.abs(wall.center[axis])).toBeCloseTo(1.6);
    expect(Math.abs(wall.center[axis]) - wall.size[axis] / 2).toBeCloseTo(1.52);
    expect(Math.abs(wall.center[axis]) + wall.size[axis] / 2).toBeCloseTo(1.68);
  }
  geometries.forEach(g => g.dispose());
});

it('keeps a straight wall flush when one segment has a disclosed blocked neighbour and the next has none', async () => {
  const { game, cells } = await stageFixture();
  game.observation!.cells.push({ ...earnedCell(-1, 1, 'other'), chests: [] });
  const scene = compileStageScene(game)!, walls = cells.slice(0, 2).map(cell => scene.boxes.find(b =>
    b.id === JSON.stringify([cell.at.level, cell.at.cell.spaceId, cell.at.cell.row, cell.at.cell.column]) + '/north/wall')!);
  expect(walls[0].center[2]).toBe(walls[1].center[2]); expect(walls[0].size[2]).toBe(walls[1].size[2]);
  const join = [1.6, 2.4, -1.52];
  expect(masonryUV(join, [0, 0, 1], walls[0].textureOrigin)).toEqual(masonryUV(join, [0, 0, 1], walls[1].textureOrigin));
});
