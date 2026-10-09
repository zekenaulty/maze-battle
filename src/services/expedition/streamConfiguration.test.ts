import { describe, expect, it } from 'vitest';
import { STREAM_RECIPE, STREAM_SLOT, streamConfiguration, streamLevelFromSearch } from './streamConfiguration';

describe('isolated level configuration', () => {
  it('preserves the existing level-one recipe and saves other levels separately', () => {
    expect(streamConfiguration()).toEqual({ slot: STREAM_SLOT, recipe: STREAM_RECIPE });
    const floor = streamConfiguration(19);
    expect(floor.slot).toBe('streamed-demo-level-19');
    expect(floor.recipe).toMatchObject({ worldId: floor.slot, floorId: 'floor-19', level: 19, seed: STREAM_RECIPE.seed });
    floor.recipe.level = 99;
    expect(streamConfiguration(19).recipe.level).toBe(19);
  });
  it.each([0, -1, 1.5, 1001, NaN, Infinity])('rejects invalid level %s', level => {
    expect(() => streamConfiguration(level)).toThrow();
  });
  it('keeps query parsing bounded without changing the default save', () => {
    expect(streamLevelFromSearch('?expedition=2&level=19')).toBe(19);
    expect(streamLevelFromSearch('?expedition=2')).toBe(1);
    for (const input of ['-1', 'NaN', '1001', '0', '1.5']) expect(streamLevelFromSearch(`?level=${input}`)).toBe(1);
  });
});
