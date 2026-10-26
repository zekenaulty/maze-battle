import type { BoxGeometry } from 'three';
import { masonryUV, type TextureOrigin } from './construction';

/** A shared masonry grid: partial walls sample the same rows as their neighbours. */
export function alignBoxUVs(geometry: BoxGeometry, center: readonly [number, number, number], origin?: TextureOrigin) {
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) + center[0], y = positions.getY(i) + center[1], z = positions.getZ(i) + center[2];
    const [u, v] = masonryUV([x, y, z], [normals.getX(i), normals.getY(i), normals.getZ(i)], origin);
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
  return geometry;
}
