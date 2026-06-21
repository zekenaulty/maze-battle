import type { MazeTextureId } from '../types';

export const DEFAULT_MAZE_TEXTURE: MazeTextureId = 'brick-worn';

export const MAZE_TEXTURE_IDS = ['procedural', 'dark-flagstone', 'cobble-small', 'slab-rough', 'block-mixed', 'brick-worn'] as const satisfies readonly MazeTextureId[];

export function normalizeMazeTexture(value: string | undefined): MazeTextureId {
  return MAZE_TEXTURE_IDS.includes(value as MazeTextureId) ? (value as MazeTextureId) : DEFAULT_MAZE_TEXTURE;
}
