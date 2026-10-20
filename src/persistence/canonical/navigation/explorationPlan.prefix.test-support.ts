import type { Direction } from '../../../domain/types';
import { opposite } from '../../../domain/maze/movement';
import { earnedCell, knowledgeFixture } from '../knowledge/region.test-support';
import type { ObservedCell } from '../knowledge/types';

export function detourCells(): ObservedCell[] {
  const cells = Array.from({ length: 9 }, (_, row) => Array.from({ length: 10 }, (_, n) => {
    const column = row % 2 ? 9 - n : n, cell = earnedCell(-row, column, 'room', 16 - row, 16 + column);
    cell.chests = []; return cell;
  })).flat();
  for (let i = 1; i < cells.length; i++) {
    const from = cells[i - 1], to = cells[i], direction = detourDirection(from, to);
    from.edges[direction] = to.at; to.edges[opposite(direction)] = from.at;
  }
  delete cells.at(-1)!.edges.east;
  return cells;
}

export function detourDirection(from: ObservedCell, to: ObservedCell): Direction {
  return from.world.row !== to.world.row ? 'north' : from.world.column < to.world.column ? 'east' : 'west';
}

export async function earnedDetour(cells = detourCells()) {
  const f = knowledgeFixture(); await f.observe(cells);
  const anchor = f.checkpoint().knowledge!;
  await f.observe([{ ...cells[0], edges: {} }]);
  return { f, cells, source: { sequence: anchor.sequence, id: anchor.id, index: cells.length - 1 } };
}
