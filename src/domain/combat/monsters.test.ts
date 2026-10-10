import { describe, expect, it } from 'vitest';
import { monsterTagsForFloor } from './monsters';
import { spawnEnemies } from './spawn';

describe('monster categories', () => {
  it('tags floors and filters spawned monsters by those tags', () => {
    const tags = monsterTagsForFloor(4);
    const enemies = spawnEnemies(8, () => 0.42, tags);

    expect(tags).toEqual(['arcane', 'undead']);
    expect(enemies.length).toBeGreaterThan(0);
    expect(enemies.every((enemy) => enemy.tags.some((tag) => tags.includes(tag)))).toBe(true);
  });
});
