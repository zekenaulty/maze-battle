import { expect, it } from 'vitest';
import { childBounds, passageBounds } from '../../../domain/expedition/topology/geometry';
import { moduleSpace } from '../../../domain/expedition/topology/modules/placement';
import type { Direction } from '../../../domain/types';
import { boundsBuckets, neighborhood } from '../../topology/buckets';
import { PagedOccupancy } from '../../topology/occupancy';

it('covers every allowed module candidate within the prefetched 25-bin neighborhood', () => {
  let checked = 0, maxExtent = 0;
  for (let rows = 5; rows <= 15; rows += 2) for (let columns = 5; columns <= 15; columns += 2) {
    const room = moduleSpace('source', 'room', { row: -41, column: 19, rows, columns }, 0);
    const center = { row: room.origin.row + Math.floor(rows / 2), column: room.origin.column + Math.floor(columns / 2) };
    const bins = new Set(neighborhood(center).map(bucket => bucket.join(',')));
    for (const direction of ['north', 'east', 'south', 'west'] as Direction[]) {
      for (let r = 5; r <= 15; r += 2) for (let c = 5; c <= 15; c += 2) for (let gap = 0; gap <= 7; gap++) {
        const candidate = childBounds(room, direction, r, c, gap);
        for (const bounds of [candidate, ...(gap ? [passageBounds(room, candidate, direction)] : [])]) {
          const extent = Math.max(Math.abs(bounds.row - center.row), Math.abs(bounds.row + bounds.rows - 1 - center.row),
            Math.abs(bounds.column - center.column), Math.abs(bounds.column + bounds.columns - 1 - center.column));
          if (extent > 29 || boundsBuckets(bounds).some(bucket => !bins.has(bucket.join(',')))) throw Error('Candidate exceeds prefetched region');
          maxExtent = Math.max(maxExtent, extent);
        }
        checked++;
      }
    }
  }
  expect(checked).toBe(41472); expect(maxExtent).toBe(29);
});

it('distinguishes an absent bucket from an invalid stored null', async () => {
  const empty = new PagedOccupancy(); await empty.fetch(async () => undefined, [[0, 0]]);
  expect(empty.occupied({ row: 0, column: 0, rows: 1, columns: 1 })).toBe(false);
  const invalid = new PagedOccupancy();
  await expect(invalid.fetch(async () => null as never, [[0, 0]])).rejects.toThrow('Invalid occupancy bucket capacity');
});
