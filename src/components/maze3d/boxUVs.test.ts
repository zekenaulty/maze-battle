// @vitest-environment node
import { BoxGeometry, Triangle, Vector2, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { alignBoxUVs } from './boxUVs';
import { DOOR_HEIGHT, WALL_HEIGHT } from './constants';

type Triple = [number, number, number];
function sample(geometry: BoxGeometry, center: Triple, normal: Triple, world: Triple) {
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
  const point = new Vector3(...world).sub(new Vector3(...center)), indices = geometry.index!;
  for (let i = 0; i < indices.count; i += 3) {
    const ids = [0, 1, 2].map(j => indices.getX(i + j));
    if (!new Vector3().fromBufferAttribute(normals, ids[0]).equals(new Vector3(...normal))) continue;
    const triangle = new Triangle(...ids.map(id => new Vector3().fromBufferAttribute(positions, id)) as [Vector3, Vector3, Vector3]);
    const weights = triangle.getBarycoord(point, new Vector3());
    if (!weights || Math.min(weights.x, weights.y, weights.z) < -1e-6) continue;
    return ids.reduce((result, id, j) => result.addScaledVector(new Vector2(uv.getX(id), uv.getY(id)), weights.getComponent(j)), new Vector2());
  }
  throw Error('Sample is outside this face');
}
describe('continuous masonry across separately sized boxes', () => {
  it.each([['z', 1], ['z', -1], ['x', 1], ['x', -1]] as const)('aligns a doorway lintel with its full-height jamb on the %s/%s face', (axis, sign) => {
    const alongZ = axis === 'x';
    const lintelSize: Triple = alongZ ? [0.16, WALL_HEIGHT - DOOR_HEIGHT, 1.8] : [1.8, WALL_HEIGHT - DOOR_HEIGHT, 0.16];
    const jambSize: Triple = alongZ ? [0.16, WALL_HEIGHT, 0.7] : [0.7, WALL_HEIGHT, 0.16];
    const lintelCenter: Triple = [0, (WALL_HEIGHT + DOOR_HEIGHT) / 2, 0], jambCenter: Triple = alongZ ? [0, WALL_HEIGHT / 2, -1.25] : [-1.25, WALL_HEIGHT / 2, 0];
    const normal: Triple = alongZ ? [sign, 0, 0] : [0, 0, sign];
    const lintel = alignBoxUVs(new BoxGeometry(...lintelSize), lintelCenter), jamb = alignBoxUVs(new BoxGeometry(...jambSize), jambCenter);
    for (const height of [DOOR_HEIGHT, (DOOR_HEIGHT + WALL_HEIGHT) / 2, WALL_HEIGHT]) {
      const point: Triple = alongZ ? [sign * 0.08, height, -0.9] : [-0.9, height, sign * 0.08];
      const a = sample(lintel, lintelCenter, normal, point), b = sample(jamb, jambCenter, normal, point);
      expect(a.x).toBeCloseTo(b.x, 5); expect(a.y).toBeCloseTo(b.y, 5);
    }
    lintel.dispose(); jamb.dispose();
  });
  it('continues the floor pattern across adjacent canonical cells', () => {
    const first: Triple = [0, -0.09, 0], next: Triple = [3.2, -0.09, 0];
    const a = alignBoxUVs(new BoxGeometry(3.2, 0.18, 3.2), first), b = alignBoxUVs(new BoxGeometry(3.2, 0.18, 3.2), next);
    for (const z of [-1.6, 0, 1.6]) {
      const left = sample(a, first, [0, 1, 0], [1.6, 0, z]), right = sample(b, next, [0, 1, 0], [1.6, 0, z]);
      expect(left.x).toBeCloseTo(right.x, 5); expect(left.y).toBeCloseTo(right.y, 5);
    }
    a.dispose(); b.dispose();
  });
});
