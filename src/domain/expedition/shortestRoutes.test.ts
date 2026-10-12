import { describe, expect, it, vi } from 'vitest';
import { shortestRoutes, shortestRoutesAsync } from './shortestRoutes';

const graph = [[1, 2, 1], [0, 3], [3, 4], [4], []];
const neighbours = (key: number) => graph[key].map(next => ({ key: next, edge: `${key}:${next}` }));

describe('shared unit-cost traversal', () => {
  it('preserves synchronous ordering, parents, distances, cycles and visit hooks asynchronously', async () => {
    const syncVisit = vi.fn(), asyncVisit = vi.fn(), calls: number[] = [];
    let reading = false;
    const actual = await shortestRoutesAsync(0, async key => {
      expect(reading).toBe(false);
      reading = true;
      await Promise.resolve();
      calls.push(key); reading = false;
      return neighbours(key);
    }, 5, asyncVisit);
    const expected = shortestRoutes(0, neighbours, 5, syncVisit);
    expect(actual).toEqual(expected);
    expect([...actual.values()]).toEqual([
      { key: 0, distance: 0 }, { key: 1, distance: 1, previous: 0, edge: '0:1' },
      { key: 2, distance: 1, previous: 0, edge: '0:2' }, { key: 3, distance: 2, previous: 1, edge: '1:3' },
      { key: 4, distance: 2, previous: 2, edge: '2:4' },
    ]);
    expect(calls).toEqual([0, 1, 2, 3, 4]);
    expect(syncVisit).toHaveBeenCalledTimes(5);
    expect(asyncVisit).toHaveBeenCalledTimes(5);
  });

  it.each([0, 1, 4])('fails both searches explicitly at visit budget %s', async maxVisits => {
    expect(() => shortestRoutes(0, neighbours, maxVisits)).toThrow('Route visit budget exhausted.');
    await expect(shortestRoutesAsync(0, neighbours, maxVisits)).rejects.toThrow('Route visit budget exhausted.');
  });

  it('propagates callback and visit-hook failures without additional expansion', async () => {
    const failure = new Error('read failed'), next = vi.fn(async () => { throw failure; });
    await expect(shortestRoutesAsync(0, next, 5)).rejects.toBe(failure);
    expect(next).toHaveBeenCalledTimes(1);
    next.mockClear();
    await expect(shortestRoutesAsync(0, next, 5, () => { throw failure; })).rejects.toBe(failure);
    expect(next).not.toHaveBeenCalled();
  });
});
