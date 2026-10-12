import type { RpgPerceptionRegion } from '../domain/agentic/knowledge/perceptionTypes';
import type { Direction, GridPosition } from '../domain/types';
import { cellKey } from '../domain/maze/key';
import { movePosition, opposite } from '../domain/maze/movement';
import { isInViewport, type MazeViewport } from '../components/maze/mazeCamera';
import type { MazeViewModel } from './mazeViewModel';

/**
 * Draw-only adapter: synthetic links mean "no evidenced wall", NOT traversal.
 * Never feed this maze to a pathfinder or recompute visibility from its links.
 * Renderer positions and visibility keys are scope-local; both camera and
 * overview scans are bounded by the scope. Always pass the supplied visibility.
 * Future input adapters must bounds-check local hits, then add origin to recover
 * world coordinates; origin is not a renderer offset or traversal permission.
 * Stone/floor styling is viewport-local for now; UI adoption must decide whether
 * to preserve world-anchored styling continuity when the requested scope moves.
 */
export interface PerceivedMazeView extends MazeViewModel {
  origin: GridPosition;
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
  const worldViewport: MazeViewport = {
    rowStart: row, rowEnd: row + rows, columnStart: column, columnEnd: column + columns, rows, columns,
  };
  const localPosition = (position: GridPosition): GridPosition => ({ row: position.row - row, column: position.column - column });
  const scoped = region.cells.filter(cell => {
    const address = cell.state === 'visible' ? cell.observation.address : cell.fact.address;
    return address.floor === floor && isInViewport(address, worldViewport);
  });
  const observations = new Map(scoped.flatMap(cell => cell.state === 'visible'
    ? [[cellKey(cell.observation.address), cell.observation] as const] : []));
  const view: PerceivedMazeView = {
    facing, origin: { row, column }, chests: [],
    viewport: { rowStart: 0, rowEnd: rows, columnStart: 0, columnEnd: columns, rows, columns },
    visibility: { radius: 0, visible: new Set(), explored: new Set() },
    maze: { rows, columns,
      start: absent(), end: absent(), active: absent(), visited: [], cells: [] },
  };

  for (const cell of scoped) {
    const details = cell.state === 'visible' ? cell.observation : cell.fact;
    // Cropped/unknown exits are not walls. Only explicit blocked evidence closes a side.
    const links = directions.filter(direction => {
      if (cell.state === 'visible') return !cell.observation.blocked.includes(direction);
      if (cell.fact.edges[direction]?.state !== 'blocked') return true;
      // A shared side observed now supersedes an unseen neighbour's stale wall.
      const neighbour = observations.get(cellKey(movePosition(details.address, direction)));
      return neighbour !== undefined && !neighbour.blocked.includes(opposite(direction));
    });
    const position = localPosition(details.address);
    const key = cellKey(position);
    view.maze.cells.push({ ...position, links });
    view.visibility.explored.add(key);
    if (cell.state === 'visible') view.visibility.visible.add(key);
    if (details.chests.some(chest => !chest.opened)) view.chests.push(positionOf(position));
    if (details.stairs.includes('up') || details.stairs.includes('town')) view.maze.start = positionOf(position);
    if (details.stairs.includes('down')) view.maze.end = positionOf(position);
  }
  if (region.actor.floor === floor && observations.has(cellKey(region.actor))) {
    view.maze.active = localPosition(region.actor);
  }
  return view;
}
