import { movePosition, opposite } from '../../src/domain/maze/movement';
import type { Direction, MazeState } from '../../src/domain/types';

/** Authored layouts used by both native and real-service tests; never delivered to a planner. */
export function discoveryDungeon(variant: 'A' | 'B'): MazeState {
  const cells = Array.from({ length: 81 }, (_, i) => ({ row: Math.floor(i / 9), column: i % 9, links: [] as Direction[] }));
  const join = (row: number, column: number, direction: Direction) => {
    const next = movePosition({ row, column }, direction);
    cells[row * 9 + column].links.push(direction); cells[next.row * 9 + next.column].links.push(opposite(direction));
  };
  for (let column = 0; column < 4; column++) join(6, column, 'east');
  if (variant === 'A') for (let column = 4; column < 8; column++) join(6, column, 'east');
  else for (let row = 6; row > 2; row--) join(row, 4, 'north');
  return { rows: 9, columns: 9, start: { row: 6, column: 0 }, end: { row: 8, column: 8 }, active: { row: 6, column: 0 },
    cells, visited: [], visibility: { radius: 2, explored: [] } };
}
