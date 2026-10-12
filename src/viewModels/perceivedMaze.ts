import type { RpgPerceptionRegion } from '../domain/agentic/knowledge/perceptionTypes';
import type { Direction, GridPosition } from '../domain/types';
import { cellKey } from '../domain/maze/key';
import { movePosition, opposite } from '../domain/maze/movement';
import { isInViewport, type MazeViewport } from '../components/maze/mazeCamera';
import type { MazeViewModel } from './mazeViewModel';

/**
 * Draw-only adapter: synthetic links mean "no evidenced wall", NOT traversal.
 * Never feed this maze to a pathfinder or recompute visibility from its links.
 * Pass BOTH viewport and visibility to drawMaze in camera mode; overview mode
 * ignores the viewport and would scan the coordinate extent, not this scope.
 */
export interface PerceivedMazeView extends MazeViewModel {
  viewport: MazeViewport;
}

const directions: readonly Direction[] = ['north', 'east', 'south', 'west'];
const absent = (): GridPosition => ({ row: -1, column: -1 });
const positionOf = ({ row, column }: GridPosition): GridPosition => ({ row, column });

/** Projects a validated receipt-derived region, without reading world state. */
export function createPerceivedMazeView(region: RpgPerceptionRegion, facing: Direction): PerceivedMazeView {
  const { floor, row, column, rows, columns } = region.scope;
  if (![floor, row, column, rows, columns, row + rows, column + columns].every(Number.isSafeInteger)
    || floor < 1 || row < 0 || column < 0 || rows < 1 || columns < 1
    || rows > 64 || columns > 64 || rows * columns > 1024 || region.cells.length > rows * columns) {
    throw new RangeError('Perception scope must have safe coordinates, axes 1..64 and area <= 1024');
  }
  const viewport: MazeViewport = {
    rowStart: row, rowEnd: row + rows, columnStart: column, columnEnd: column + columns, rows, columns,
  };
  const scoped = region.cells.filter(cell => {
    const address = cell.state === 'visible' ? cell.observation.address : cell.fact.address;
    return address.floor === floor && isInViewport(address, viewport);
  });
  const observations = new Map(scoped.flatMap(cell => cell.state === 'visible'
    ? [[cellKey(cell.observation.address), cell.observation] as const] : []));
  const view: PerceivedMazeView = {
    facing, viewport, chests: [],
    visibility: { radius: 0, visible: new Set(), explored: new Set() },
    maze: { rows: viewport.rowEnd, columns: viewport.columnEnd,
      start: absent(), end: absent(), active: absent(), visited: [], cells: [] },
  };

  for (const cell of scoped) {
    const details = cell.state === 'visible' ? cell.observation : cell.fact;
    const position = positionOf(details.address);
    const key = cellKey(position);
    // Cropped/unknown exits are not walls. Only explicit blocked evidence closes a side.
    const links = directions.filter(direction => {
      if (cell.state === 'visible') return !cell.observation.blocked.includes(direction);
      if (cell.fact.edges[direction]?.state !== 'blocked') return true;
      // A shared side observed now supersedes an unseen neighbour's stale wall.
      const neighbour = observations.get(cellKey(movePosition(position, direction)));
      return neighbour !== undefined && !neighbour.blocked.includes(opposite(direction));
    });
    view.maze.cells.push({ ...position, links });
    view.visibility.explored.add(key);
    if (cell.state === 'visible') view.visibility.visible.add(key);
    if (details.chests.some(chest => !chest.opened)) view.chests.push(positionOf(position));
    if (details.stairs.includes('up') || details.stairs.includes('town')) view.maze.start = positionOf(position);
    if (details.stairs.includes('down')) view.maze.end = positionOf(position);
  }
  if (region.actor.floor === floor && view.visibility.visible.has(cellKey(region.actor))) {
    view.maze.active = positionOf(region.actor);
  }
  return view;
}
