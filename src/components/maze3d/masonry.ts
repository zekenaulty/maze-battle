import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { SceneBox } from './scene';

type Rect = [number, number, number, number];
const snap = (n: number) => Math.round(n * 1e6) / 1e6;
const axes = [[1, 2], [2, 0], [0, 1]];
export function subtractRectangle(rect: Rect, cover: Rect): Rect[] {
  const [a, b, c, d] = rect, x = Math.max(a, cover[0]), xx = Math.min(b, cover[1]), y = Math.max(c, cover[2]), yy = Math.min(d, cover[3]);
  if (x >= xx || y >= yy) return [rect];
  return [[a, x, c, d], [xx, b, c, d], [x, xx, c, y], [x, xx, yy, d]].filter(([a, b, c, d]) => b > a && d > c) as Rect[];
}
// Choose deck materials only where faces actually coincide. An unmatched floor still needs its underside.
const priority = (box: SceneBox, axis: number, sign: number) => !box.deck ? 0 : (axis === 1 && sign < 0 ? box.deck === 'ceiling' : box.deck === 'floor') ? 2 : 1;

/** Exposed faces of the masonry union. Adjacent/overlapping boxes share one surface owner. */
export function masonrySurfaces(boxes: SceneBox[]) {
  const bounds = boxes.map(box => ({ min: box.center.map((c, i) => snap(c - box.size[i] / 2)), max: box.center.map((c, i) => snap(c + box.size[i] / 2)) }));
  // Local broad phase: no world-sized voxel array and no all-pairs room scan.
  const buckets = new Map<string, number[]>(), memberships: string[][] = [];
  for (let i = 0; i < boxes.length; i++) {
    const { min, max } = bounds[i], keys: string[] = [];
    for (let x = Math.floor(min[0] / 3.2); x <= Math.floor(max[0] / 3.2); x++)
      for (let y = Math.floor(min[1] / 3.2); y <= Math.floor(max[1] / 3.2); y++)
        for (let z = Math.floor(min[2] / 3.2); z <= Math.floor(max[2] / 3.2); z++) {
          const key = `${x}/${y}/${z}`, bucket = buckets.get(key) ?? []; bucket.push(i); buckets.set(key, bucket); keys.push(key);
        }
    memberships.push(keys);
  }
  return boxes.map((box, i) => {
    const vertices: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
    const candidates = [...new Set(memberships[i].flatMap(key => buckets.get(key)!))].filter(j => j !== i);
    const b = bounds[i];
    for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
      const [a, c] = axes[axis], plane = sign > 0 ? b.max[axis] : b.min[axis];
      let rects: Rect[] = [[b.min[a], b.max[a], b.min[c], b.max[c]]];
      for (const j of candidates) {
        const other = bounds[j];
        if (other.min[axis] > plane || other.max[axis] < plane) continue;
        const outside = sign > 0 ? other.max[axis] > plane : other.min[axis] < plane;
        const rank = priority(box, axis, sign), otherRank = priority(boxes[j], axis, sign);
        const coplanarOwner = !outside && (otherRank > rank || otherRank === rank && boxes[j].id < box.id);
        if (!outside && !coplanarOwner) continue;
        rects = rects.flatMap(rect => subtractRectangle(rect, [other.min[a], other.max[a], other.min[c], other.max[c]]));
        if (!rects.length) break;
      }
      for (const [loA, hiA, loC, hiC] of rects) {
        const start = vertices.length / 3;
        for (const [av, cv] of [[loA, loC], [hiA, loC], [hiA, hiC], [loA, hiC]]) {
          const p = [0, 0, 0], n = [0, 0, 0]; p[axis] = plane; p[a] = av; p[c] = cv; n[axis] = sign;
          vertices.push(...p); normals.push(...n);
          uvs.push((axis === 0 ? -sign * p[2] : axis === 2 ? sign * p[0] : p[0]) / 1.6,
            (axis === 1 ? -sign * p[2] : p[1]) / 1.6);
        }
        indices.push(...(sign > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]).map(n => n + start));
      }
    }
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3)); geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices);
    return geometry;
  });
}
