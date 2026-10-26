import { STAIR_RECIPE, type FloorFrame } from '../../domain/expedition/vertical';
import { CELL_SIZE, MASONRY_TILE_SIZE, WALL_HEIGHT } from './constants';

export type TextureOrigin = [number, number, number];
export const WALL_THICKNESS = .16;
export const SLAB_THICKNESS = .18;
export const STAGE_FLOOR_RISE = WALL_HEIGHT + SLAB_THICKNESS;
// The two landings are three cells apart. Saved v1 placements retain their original measurements.
export const STAGE_STAIR_SEPARATION = CELL_SIZE * 3;
export function constructionOffset(frame: FloorFrame, origin: FloorFrame): TextureOrigin {
  const floors = (frame[1] - origin[1]) / STAIR_RECIPE.rise;
  return [frame[0] - origin[0], floors * STAGE_FLOOR_RISE,
    frame[2] - origin[2] + floors * (STAGE_STAIR_SEPARATION - STAIR_RECIPE.separation)];
}

/** A floor's grid boundary and finished floor height are its shared texture datum. */
export function masonryUV(point: readonly number[], normal: readonly number[], origin: TextureOrigin = [0, 0, 0]): [number, number] {
  const [x, y, z] = point.map((n, i) => n - origin[i]), [nx, ny, nz] = normal;
  return [(nx ? -nx * z : nz ? nz * x : x) / MASONRY_TILE_SIZE,
    (ny ? -ny * z : y) / MASONRY_TILE_SIZE];
}
