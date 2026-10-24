import type { BoxGeometry } from 'three';

const TILE_SIZE = 1.6;

/** A shared masonry grid: partial walls sample the same rows as their neighbours. */
export function alignBoxUVs(geometry: BoxGeometry, center: readonly [number, number, number]) {
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) + center[0], y = positions.getY(i) + center[1], z = positions.getZ(i) + center[2];
    const nx = normals.getX(i), ny = normals.getY(i), nz = normals.getZ(i);
    const u = nx ? (nx > 0 ? -z : z) : x * (nz < 0 ? -1 : 1);
    const v = ny ? (ny > 0 ? -z : z) : y;
    uv.setXY(i, u / TILE_SIZE, v / TILE_SIZE);
  }
  uv.needsUpdate = true;
  return geometry;
}
