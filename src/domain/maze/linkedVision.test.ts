import { describe, expect, it, vi } from 'vitest';
import { asyncLinkedVision, linkedVision } from './linkedVision';

const key = (cell: string) => cell;

describe('linked vision', () => {
  it('keeps sync/async results and reads in stable BFS order through cycles and duplicate links', async () => {
    const links: Record<string, readonly string[]> = {
      origin: ['right', 'left', 'right', 'origin'],
      right: ['origin', 'shared', 'far-right'],
      left: ['shared', 'far-left'],
      shared: ['origin'],
      'far-right': ['left'],
      'far-left': [],
      blocked: ['origin'],
    };
    const syncReads: string[] = [];
    const asyncReads: string[] = [];
    const sync = linkedVision<string>('origin', 3, key, cell => {
      syncReads.push(cell);
      return links[cell];
    });
    const async = await asyncLinkedVision<string>('origin', 3, key, async cell => {
      await Promise.resolve();
      asyncReads.push(cell);
      return links[cell];
    });

    expect(sync).toEqual(['origin', 'right', 'left', 'shared', 'far-right', 'far-left']);
    expect(async).toEqual(sync);
    expect(syncReads).toEqual(sync);
    expect(asyncReads).toEqual(syncReads);
  });

  it('deduplicates by key and retains the first cell supplied for that key', async () => {
    const origin = { id: 'origin' };
    const first = { id: 'linked' };
    const duplicate = { id: 'linked' };
    const cellKey = (cell: typeof origin) => cell.id;
    const neighbors = () => [first, duplicate, { id: 'origin' }];
    const sync = linkedVision(origin, 2, cellKey, neighbors, 2);
    const async = await asyncLinkedVision(origin, 2, cellKey, async () => neighbors(), 2);

    expect(sync).toEqual([origin, first]);
    expect(async).toEqual(sync);
    expect(sync[0]).toBe(origin);
    expect(sync[1]).toBe(first);
    expect(async[1]).toBe(first);
  });

  it.each(Array.from({ length: 17 }, (_, radius) => radius))(
    'does not read neighbors at or beyond radius %i',
    async radius => {
      const neighbors = vi.fn((cell: number): readonly number[] => {
        if (cell >= radius) throw new Error('Read outside the expansion boundary');
        return [cell + 1];
      });
      const expected = Array.from({ length: radius + 1 }, (_, cell) => cell);
      expect(linkedVision(0, radius, String, neighbors)).toEqual(expected);
      expect(neighbors.mock.calls.map(([cell]) => cell)).toEqual(expected.slice(0, -1));
      neighbors.mockClear();
      expect(await asyncLinkedVision<number>(0, radius, String, async cell => neighbors(cell))).toEqual(expected);
      expect(neighbors.mock.calls.map(([cell]) => cell)).toEqual(expected.slice(0, -1));
    },
  );

  it.each([-1, 17, 0.5, NaN, Infinity, -Infinity])('rejects invalid radius %s before reading', async radius => {
    const cellKey = vi.fn(key);
    const neighbors = vi.fn((): readonly string[] => []);
    expect(() => linkedVision('origin', radius, cellKey, neighbors)).toThrow(RangeError);
    await expect(asyncLinkedVision('origin', radius, cellKey, async () => neighbors())).rejects.toThrow(RangeError);
    expect(cellKey).not.toHaveBeenCalled();
    expect(neighbors).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid maxCells %s before reading',
    async maxCells => {
      const cellKey = vi.fn(key);
      const neighbors = vi.fn((): readonly string[] => []);
      expect(() => linkedVision('origin', 0, cellKey, neighbors, maxCells)).toThrow(RangeError);
      await expect(asyncLinkedVision('origin', 0, cellKey, async () => neighbors(), maxCells)).rejects.toThrow(RangeError);
      expect(cellKey).not.toHaveBeenCalled();
      expect(neighbors).not.toHaveBeenCalled();
    },
  );

  it('counts the origin, allows the exact limit, and throws instead of truncating overflow', async () => {
    const neighbors = vi.fn((cell: number): readonly number[] => cell === 0 ? [0, 1, 1] : [0, 2]);
    expect(linkedVision(0, 0, String, neighbors, 1)).toEqual([0]);
    expect(await asyncLinkedVision<number>(0, 0, String, async cell => neighbors(cell), 1)).toEqual([0]);
    expect(neighbors).not.toHaveBeenCalled();
    expect(linkedVision(0, 1, String, neighbors, 2)).toEqual([0, 1]);
    expect(await asyncLinkedVision<number>(0, 1, String, async cell => neighbors(cell), 2)).toEqual([0, 1]);

    neighbors.mockClear();
    expect(() => linkedVision(0, 2, String, neighbors, 2)).toThrow('exceeds maxCells (2)');
    expect(neighbors.mock.calls.map(([cell]) => cell)).toEqual([0, 1]);
    neighbors.mockClear();
    await expect(asyncLinkedVision<number>(0, 2, String, async cell => neighbors(cell), 2)).rejects.toThrow('exceeds maxCells (2)');
    expect(neighbors.mock.calls.map(([cell]) => cell)).toEqual([0, 1]);
  });

  it('defaults to 545 cells and permits an explicit larger bound', async () => {
    const neighbors = (cell: number): readonly number[] => cell === 0
      ? Array.from({ length: 545 }, (_, index) => index + 1)
      : [];
    const atLimit = () => neighbors(0).slice(0, 544);
    expect(linkedVision(0, 1, String, atLimit)).toHaveLength(545);
    expect(await asyncLinkedVision(0, 1, String, async () => atLimit())).toHaveLength(545);
    expect(() => linkedVision(0, 1, String, neighbors)).toThrow('exceeds maxCells (545)');
    await expect(asyncLinkedVision<number>(0, 1, String, async cell => neighbors(cell))).rejects.toThrow('exceeds maxCells (545)');
    expect(linkedVision(0, 1, String, neighbors, 546)).toHaveLength(546);
    expect(await asyncLinkedVision<number>(0, 1, String, async cell => neighbors(cell), 546)).toHaveLength(546);
  });

  it('propagates reader failures without returning partial visibility', async () => {
    const failure = new Error('Room unavailable');
    const neighbors = () => { throw failure; };
    expect(() => linkedVision('origin', 1, key, neighbors)).toThrow(failure);
    await expect(asyncLinkedVision('origin', 1, key, async () => neighbors())).rejects.toBe(failure);
  });
});
