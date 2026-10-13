import type { Direction, GridPosition } from '../domain/types';
import { cellKey } from '../domain/maze/key';
import { movePosition, opposite } from '../domain/maze/movement';
import { createMazeCamera, isInViewport, type MazeCameraState, type MazeViewport } from '../components/maze/mazeCamera';
import { validateRegionScope, type KnowledgeRegion, type KnowledgeRegionScope } from '../persistence/canonical/knowledge/region';
import { DIRECTIONS } from '../persistence/canonical/knowledge/types';
import type { GameView } from '../services/game/GameView';
import type { MazeViewModel } from './mazeViewModel';

export interface CanonicalPerceivedMaze extends MazeViewModel { origin: GridPosition; viewport: MazeViewport }
const absent = (): GridPosition => ({ row: -1, column: -1 });
export function emptyCanonicalMazeView(scope: KnowledgeRegionScope, facing: Direction): CanonicalPerceivedMaze {
  validateRegionScope(scope);
  const { row, column, rows, columns } = scope;
  return { facing, origin: { row, column }, chests: [],
    viewport: { rowStart: 0, rowEnd: rows, columnStart: 0, columnEnd: columns, rows, columns },
    visibility: { radius: 0, visible: new Set(), explored: new Set() },
    maze: { rows, columns, start: absent(), end: absent(), active: absent(), visited: [], cells: [] } };
}

/** Draw-only links mean no evidenced wall, never authoritative traversability. */
export function createCanonicalMazeView(region: KnowledgeRegion, facing: Direction): CanonicalPerceivedMaze {
  const view = emptyCanonicalMazeView(region.scope, facing), { row, column, rows, columns, floor } = region.scope;
  if (region.cells.length > rows * columns) throw new RangeError('Unbounded region cells');
  const viewport = { rowStart: row, rowEnd: row + rows, columnStart: column, columnEnd: column + columns, rows, columns };
  const local = (p: GridPosition): GridPosition => ({ row: p.row - row, column: p.column - column });
  const visible = new Map(region.cells.flatMap(c => c.state === 'visible' ? [[cellKey(c.observation.world), c.observation] as const] : []));
  for (const entry of region.cells) {
    const details = entry.state === 'visible' ? entry.observation : entry.cell;
    if (details.at.level !== floor || !isInViewport(details.world, viewport)) throw new Error('Cell outside perception scope');
    const position = local(details.world), key = cellKey(position);
    if (view.visibility.explored.has(key)) throw new Error('Duplicate perception coordinate');
    const links = DIRECTIONS.filter(d => {
      if (entry.state === 'visible') return entry.observation.edges[d] !== null;
      if (entry.cell.edges[d]?.target !== null) return true;
      const neighbour = visible.get(cellKey(movePosition(details.world, d)));
      // Only an explicit current open edge supersedes a remembered shared wall.
      return neighbour?.edges[opposite(d)] != null;
    });
    view.maze.cells.push({ ...position, links }); view.visibility.explored.add(key);
    if (entry.state === 'visible') view.visibility.visible.add(key);
    if (details.chests.some(c => !c.opened)) view.chests.push(position);
    if (details.stairs.includes('town') || details.stairs.includes('up')) view.maze.start = position;
    if (details.stairs.includes('down')) view.maze.end = position;
  }
  if (region.actor && isInViewport(region.actor, viewport) && view.visibility.visible.has(cellKey(local(region.actor))))
    view.maze.active = local(region.actor);
  return view;
}

/** Observation-local address identifies the actor; only earned world coordinates center the camera. */
export function currentVisibleCell(game: Pick<GameView, 'checkpoint' | 'observation'>) {
  const { checkpoint: c, observation: o } = game, at = c.position;
  if (c.mode === 'town' || !o || o.header.sequence !== c.knowledge?.sequence || o.header.actor.level !== at.level
    || o.header.actor.cell.spaceId !== at.cell.spaceId || o.header.actor.cell.row !== at.cell.row || o.header.actor.cell.column !== at.cell.column) return undefined;
  return o.cells.find(cell => cell.at.level === at.level && cell.at.cell.spaceId === at.cell.spaceId
    && cell.at.cell.row === at.cell.row && cell.at.cell.column === at.cell.column);
}

/** Signed camera policy, independent of hidden room/floor extents. Overview remains a bounded window. */
export function canonicalPerceptionScope(floor: number, actor: GridPosition, size: { width: number; height: number },
  camera: MazeCameraState, mode: 'camera' | 'overview'): KnowledgeRegionScope {
  const extent = createMazeCamera({ rows: 64, columns: 64, active: { row: 0, column: 0 } }, size, camera);
  const rows = mode === 'overview' ? Math.min(32, extent.rows * 2 + 1) : extent.rows;
  const columns = mode === 'overview' ? Math.min(32, extent.columns * 2 + 1) : extent.columns;
  const origin = camera.mode === 'manual' && camera.origin ? camera.origin
    : { row: Math.floor(actor.row / rows) * rows, column: Math.floor(actor.column / columns) * columns };
  const scope = { floor, rows, columns, row: clampWorldOrigin(origin.row, rows), column: clampWorldOrigin(origin.column, columns) };
  validateRegionScope(scope); return scope;
}
function clampWorldOrigin(value: number, size: number) {
  return Math.max(Number.MIN_SAFE_INTEGER, Math.min(Number.MAX_SAFE_INTEGER - size, value));
}
