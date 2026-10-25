// @vitest-environment node
import { expect, it } from 'vitest';
import { Triangle as ThreeTriangle, Vector3, type BufferGeometry } from 'three';
import { masonrySurfaces } from './masonry';
import { compileStageScene, cutStairDecks, stairEnclosure, type SceneBox, type StageFlight } from './scene';
import { stageFixture } from './stage.test-support';

type Triangle = { p: Vector3[]; normal: Vector3; area: number };
const box = (id: string, center: SceneBox['center'], size: SceneBox['size'], deck?: SceneBox['deck']): SceneBox =>
  ({ id, center, size, material: 'stone_bricks', solid: true, ...(deck ? { deck } : {}) });
const triangles = (geometries: BufferGeometry[]) => geometries.flatMap(g => {
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), index = [...g.index!.array], result: Triangle[] = [];
  for (let i = 0; i < index.length; i += 3) {
    const points = index.slice(i, i + 3).map(j => new Vector3().fromBufferAttribute(p, j));
    const cross = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
    result.push({ p: points, normal: new Vector3().fromBufferAttribute(n, index[i]), area: cross.length() / 2 });
    expect(cross.dot(result.at(-1)!.normal)).toBeGreaterThan(1e-9);
  }
  return result;
});
const inside = (boxes: SceneBox[], p: Vector3) => boxes.some(b => b.center.every((c, i) => Math.abs(p.getComponent(i) - c) < b.size[i] / 2 - 1e-6));
function intersectionArea(a: Triangle, b: Triangle) {
  const axis = a.normal.toArray().findIndex(n => n !== 0), keep = [0, 1, 2].filter(i => i !== axis);
  if (Math.abs(a.p[0].getComponent(axis) - b.p[0].getComponent(axis)) > 1e-6 || Math.abs(a.normal.dot(b.normal)) < .99) return 0;
  const project = (p: Vector3) => keep.map(i => p.getComponent(i));
  let polygon = a.p.map(project); const clip = b.p.map(project);
  const cross = (p: number[], q: number[], r: number[]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const sign = Math.sign(cross(clip[0], clip[1], clip[2]));
  for (let i = 0; i < 3 && polygon.length; i++) {
    const edge = clip[i], end = clip[(i + 1) % 3], output: number[][] = [];
    for (let j = 0; j < polygon.length; j++) {
      const p = polygon[j], q = polygon[(j + 1) % polygon.length], dp = sign * cross(edge, end, p), dq = sign * cross(edge, end, q);
      if (dp >= -1e-9) output.push(p);
      if ((dp < 0) !== (dq < 0)) { const t = dp / (dp - dq); output.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
    }
    polygon = output;
  }
  return Math.abs(polygon.reduce((sum, p, i) => { const q = polygon[(i + 1) % polygon.length]; return sum + p[0] * q[1] - p[1] * q[0]; }, 0)) / 2;
}
function exposedUnion(boxes: SceneBox[]) {
  const geometries = masonrySurfaces(boxes), faces = triangles(geometries);
  try {
    for (const face of faces) {
      const center = face.p.reduce((sum, p) => sum.add(p), new Vector3()).multiplyScalar(1 / 3);
      expect(inside(boxes, center.clone().addScaledVector(face.normal, .0001)), 'internal face emitted').toBe(false);
      expect(inside(boxes, center.clone().addScaledVector(face.normal, -.0001)), 'face has no solid backing').toBe(true);
    }
    for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++)
      expect(intersectionArea(faces[i], faces[j]), `coplanar triangles ${i}/${j}`).toBeLessThan(1e-6);
    return faces;
  } finally { geometries.forEach(g => g.dispose()); }
}

it('removes shared, buried, duplicate and partially overlapping cuboid surfaces', () => {
  const cubes = [box('a', [0, 0, 0], [1, 1, 1]), box('b', [.5, 0, 0], [1, 1, 1]),
    box('duplicate', [0, 0, 0], [1, 1, 1]), box('buried', [.25, 0, 0], [.1, .1, .1])];
  const faces = exposedUnion(cubes);
  expect(faces.reduce((sum, face) => sum + face.area, 0)).toBeCloseTo(8);
  const adjacent = exposedUnion([box('left', [-.5, 0, 0], [1, 1, 1]), box('right', [.5, 0, 0], [1, 1, 1])]);
  expect(adjacent.reduce((sum, face) => sum + face.area, 0)).toBeCloseTo(10);
});

it('keeps a translated three-way wall junction watertight across negative spatial buckets', () => {
  exposedUnion([box('x', [-3.2, -3.2, -3.2], [6.4, 4.5, .16]),
    box('z', [-3.2, -3.2, -3.2], [.16, 4.5, 6.4]), box('header', [-3.2, -1.6, -3.2], [1.8, 1.3, .32])]);
});

it('fills all four exposed room corner quadrants rather than leaving half-thickness notches', async () => {
  const { game } = await stageFixture(); game.observation!.cells = [game.observation!.cells[0]];
  game.observation!.cells[0].edges = { north: null, east: null, south: null, west: null };
  const scene = compileStageScene(game)!;
  const walls = scene.boxes.filter(b => b.id.endsWith('/wall'));
  for (const x of [-1.64, 1.64]) for (const z of [-1.64, 1.64]) expect(inside(walls, new Vector3(x, 2, z))).toBe(true);
  exposedUnion(walls);
});

it('assigns a coincident floor/ceiling slab one exterior owner per side', () => {
  const slab = [box('floor', [-3.2, -.09, 6.4], [3.2, .18, 3.2], 'floor'), box('ceiling', [-3.2, -.09, 6.4], [3.2, .18, 3.2], 'ceiling')];
  const geometries = masonrySurfaces(slab), floor = triangles([geometries[0]]), ceiling = triangles([geometries[1]]);
  expect(floor.some(t => t.normal.y === -1)).toBe(false);
  expect(ceiling.every(t => t.normal.y === -1)).toBe(true);
  expect(ceiling.reduce((sum, t) => sum + t.area, 0)).toBeCloseTo(10.24);
  geometries.forEach(g => g.dispose()); exposedUnion(slab);
});

it.each(['floor', 'ceiling'] as const)('keeps all six exterior faces of an unmatched %s slab', deck => {
  const faces = exposedUnion([box(deck, [-3.2, -.09, 6.4], [2, .18, 2], deck)]);
  expect(faces).toHaveLength(12);
  expect(faces.reduce((sum, face) => sum + face.area, 0)).toBeCloseTo(9.44);
  for (const sign of [-1, 1]) expect(faces.filter(t => t.normal.y === sign).reduce((sum, t) => sum + t.area, 0)).toBeCloseTo(4);
});

it('uses floor material above and ceiling material below only the shared part of phase-shifted slabs', () => {
  const floor = { ...box('z-floor', [-1, -.09, 0], [2, .18, 2], 'floor'), material: 'cobblestone' };
  const ceiling = box('a-ceiling', [0, -.09, 0], [2, .18, 2], 'ceiling');
  for (const input of [[floor, ceiling], [ceiling, floor]]) {
    const geometries = masonrySurfaces(input);
    try {
      const byDeck = new Map(input.map((b, i) => [b.deck, triangles([geometries[i]])]));
      const area = (deck: 'floor' | 'ceiling', sign: number) => byDeck.get(deck)!.filter(t => t.normal.y === sign).reduce((sum, t) => sum + t.area, 0);
      expect(area('floor', 1)).toBeCloseTo(4); expect(area('floor', -1)).toBeCloseTo(2);
      expect(area('ceiling', 1)).toBeCloseTo(2); expect(area('ceiling', -1)).toBeCloseTo(4);
      const owners = (x: number, y: number, sign: number) => input.filter((_, i) => triangles([geometries[i]]).some(t =>
        t.normal.y === sign && Math.abs(t.p[0].y - y) < 1e-6 && ThreeTriangle.containsPoint(new Vector3(x, y, .123), t.p[0], t.p[1], t.p[2]))).map(b => b.material);
      expect(owners(-.5, 0, 1)).toEqual(['cobblestone']); expect(owners(-.5, -.18, -1)).toEqual(['stone_bricks']);
      expect(owners(-1.5, -.18, -1)).toEqual(['cobblestone']); expect(owners(.5, 0, 1)).toEqual(['stone_bricks']);
    } finally { geometries.forEach(g => g.dispose()); }
    expect(exposedUnion(input).reduce((sum, t) => sum + t.area, 0)).toBeCloseTo(13.8);
  }
});

it('unions the real flight steps and enclosure with cut decks from both phase-shifted room grids', () => {
  const f: StageFlight = { id: 'flight', upper: { x: 13.125, y: 8, z: -20.4 }, lower: { x: 13.125, y: 3.32, z: -29.76 } };
  const decks: SceneBox[] = [box('upper/floor', [f.upper.x, f.upper.y - .09, f.upper.z], [3.2, .18, 3.2], 'floor'),
    box('lower/ceiling', [f.lower.x, f.upper.y - .09, f.lower.z], [3.2, .18, 3.2], 'ceiling')];
  for (const x of [-3.2, 3.2]) for (const row of [1, 2]) {
    decks.push(box(`upper/${x}/${row}/floor`, [f.upper.x + x, f.upper.y - .09, f.upper.z - row * 3.2], [3.2, .18, 3.2], 'floor'));
    decks.push(box(`lower/${x}/${row}/ceiling`, [f.lower.x + x, f.upper.y - .09, f.lower.z + row * 3.2], [3.2, .18, 3.2], 'ceiling'));
  }
  const faces = exposedUnion(cutStairDecks([...decks, ...stairEnclosure(f)], [f]));
  // The upper bypass protrudes 0.24 beyond the shifted lower ceiling. Its underside still closes the slab.
  const underside = new Vector3(f.upper.x + 3.2, f.upper.y - .18, f.upper.z - 7.9);
  expect(faces.some(t => t.normal.y === -1 && Math.abs(t.p[0].y - underside.y) < 1e-6
    && ThreeTriangle.containsPoint(underside, t.p[0], t.p[1], t.p[2]))).toBe(true);
});

it('preserves outward winding and a continuous world UV grid after floor, ceiling and wall clipping', () => {
  const boxes = [box('floor', [-3.2, -.09, 6.4], [3.2, .18, 3.2], 'floor'), box('ceiling', [-3.2, -.09, 6.4], [3.2, .18, 3.2], 'ceiling'),
    box('wall', [-4.8, 2.16, 6.4], [.16, 4.5, 3.36]), box('cross-wall', [-3.2, 2.16, 8], [3.36, 4.5, .16])];
  const geometries = masonrySurfaces(boxes);
  try {
    triangles(geometries);
    for (const geometry of geometries) {
      const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
      for (let i = 0; i < p.count; i++) {
        const u = n.getX(i) ? -n.getX(i) * p.getZ(i) : n.getZ(i) ? n.getZ(i) * p.getX(i) : p.getX(i);
        const v = n.getY(i) ? -n.getY(i) * p.getZ(i) : p.getY(i);
        expect(uv.getX(i)).toBeCloseTo(u / 1.6, 5); expect(uv.getY(i)).toBeCloseTo(v / 1.6, 5);
      }
    }
  } finally { geometries.forEach(g => g.dispose()); }
  exposedUnion(boxes);
});
