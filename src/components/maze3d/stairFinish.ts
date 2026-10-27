import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { SceneBox } from './scene';
import type { ArchitectureOptions } from './supports';
export type StairFaceRole = 'base' | 'riser' | 'metal';
/** UVs refer to full retained images. These are bounded face bands, not new cropped images. */
export const STAIR_BANDS = { riser: [.0625, 1 - .6875, .9375, 1 - .59375], metal: [.125, 1 - .0390625, .875, 1 - .0078125] } as const;
/** Preserve the exposed masonry union. Split a riser into non-overlapping finish regions. */
export function stairFaceFinishes(box: SceneBox, source: BufferGeometry, options: ArchitectureOptions): Array<{ role: StairFaceRole; geometry: BufferGeometry }> {
  if (!/\/step\/\d+$/.test(box.id) || !options.dressedRisers && !options.ironNosing) return [{ role: 'base', geometry: source }];
  const p = source.getAttribute('position'), n = source.getAttribute('normal'), uv = source.getAttribute('uv');
  const data = new Map<StairFaceRole, { p: number[]; n: number[]; uv: number[]; indices: number[] }>();
  const top = box.center[1] + box.size[1] / 2, edge = top - .075;
  for (let first = 0; first < p.count; first += 4) {
    const riser = n.getZ(first) < -.5, low = Math.min(...[0, 1, 2, 3].map(i => p.getY(first + i))), high = Math.max(...[0, 1, 2, 3].map(i => p.getY(first + i)));
    const regions: Array<[StairFaceRole, number, number]> = !riser ? [['base', low, high]] : options.ironNosing
      ? [[options.dressedRisers ? 'riser' : 'base', low, Math.min(high, edge)], ['metal', Math.max(low, edge), high]] : [['riser', low, high]];
    for (const [role, lo, hi] of regions) {
      if (riser && hi - lo <= 1e-7) continue;
      const result = data.get(role) ?? { p: [], n: [], uv: [], indices: [] }, start = result.p.length / 3;
      for (let j = 0; j < 4; j++) {
        const i = first + j, x = p.getX(i), y = riser ? p.getY(i) === low ? lo : hi : p.getY(i), z = p.getZ(i);
        result.p.push(x, y, z); result.n.push(n.getX(i), n.getY(i), n.getZ(i));
        if (role === 'base') {
          // Interpolate a clipped base face's original UVs along its vertical edge.
          const t = high === low ? 0 : (y - low) / (high - low), sameX = [0, 1, 2, 3].map(j => first + j).filter(k => Math.abs(p.getX(k) - x) < 1e-6);
          const a = sameX.find(k => p.getY(k) === low) ?? i, b = sameX.find(k => p.getY(k) === high) ?? i;
          result.uv.push(uv.getX(i), riser ? uv.getY(a) + t * (uv.getY(b) - uv.getY(a)) : uv.getY(i));
        } else {
          const band = STAIR_BANDS[role], u = (x - box.center[0] + box.size[0] / 2) / box.size[0], v = (y - lo) / (hi - lo);
          result.uv.push(band[0] + u * (band[2] - band[0]), band[1] + v * (band[3] - band[1]));
        }
      }
      const sign = Math.sign(n.getX(first) + n.getY(first) + n.getZ(first));
      result.indices.push(...(sign > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]).map(i => i + start)); data.set(role, result);
    }
  }
  source.dispose(); return [...data].map(([role, d]) => {
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(d.p, 3)); geometry.setAttribute('normal', new Float32BufferAttribute(d.n, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(d.uv, 2)); geometry.setIndex(d.indices); return { role, geometry };
  });
}
