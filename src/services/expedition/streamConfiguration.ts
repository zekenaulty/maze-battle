import type { TopologyRecipe } from '../../domain/expedition/topology/types';

export const STREAM_CELL_BUDGET = 512;
export const STREAM_SLOT = 'streamed-demo';
export const STREAM_RECIPE: TopologyRecipe = { version: 'spaces-v2', worldId: STREAM_SLOT, floorId: 'floor-1', seed: 20261008, level: 1 };
export interface StreamConfiguration { slot: string; recipe: TopologyRecipe }

/** A level experiment gets a different save, never a new recipe for the same slot. */
export function streamConfiguration(level = 1): StreamConfiguration {
  if (!Number.isSafeInteger(level) || level < 1 || level > 1000) throw new Error('Expedition level must be 1 through 1000');
  const slot = level === 1 ? STREAM_SLOT : `${STREAM_SLOT}-level-${level}`;
  return { slot, recipe: { ...STREAM_RECIPE, worldId: slot, floorId: `floor-${level}`, level } };
}
export function streamLevelFromSearch(search: string): number {
  const input = new URLSearchParams(search).get('level');
  const level = input === null ? 1 : Number(input);
  return Number.isSafeInteger(level) && level >= 1 && level <= 1000 ? level : 1;
}
