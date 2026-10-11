import type { GridPosition, MazeCellState, MazeRoomConnection, MazeState } from '../types';
import { materializeSpace } from '../expedition/schematic';
import { ModuleAssembly } from '../expedition/topology/modules/assembly';
import { DEFAULT_MODULE_LIMITS, type ModuleLimits, type ModuleRecipe } from '../expedition/topology/modules/policy';
import { assertModuleQuality } from '../expedition/topology/modules/quality';
import { ModuleCapacityError } from '../expedition/topology/modules/types';
import { boundary, world } from '../expedition/topology/geometry';
import { assignModuleRoles } from './moduleRoles';
import { movePosition, opposite } from './movement';
import { orthogonalPath } from './structuredGraph';
import { findPath } from './solver';
import { revealMazeVisibility } from './visibility';

/** Build privately, qualify, then publish one RPG floor. No stream save or loot state. */
export function generateModuleMaze(recipe: ModuleRecipe, limits: ModuleLimits = DEFAULT_MODULE_LIMITS): MazeState {
  const assembly = new ModuleAssembly(recipe, limits).finish();
  const quality = assertModuleQuality(assembly);
  if (quality.projectionCells > limits.maxProjectionCells) {
    throw new ModuleCapacityError('projection', `Requested ${quality.projectionCells} cells exceeds projection budget ${limits.maxProjectionCells}`);
  }
  const project = (point: GridPosition): GridPosition => ({ row: point.row - quality.origin.row, column: point.column - quality.origin.column });
  const spaces = new Map(assembly.spaces.map(space => [space.id, space]));
  const cells: MazeCellState[] = Array.from({ length: quality.projectionCells }, (_, index) => ({
    row: Math.floor(index / quality.columns), column: index % quality.columns, links: [],
  }));
  const cellAt = (point: GridPosition) => cells[point.row * quality.columns + point.column];
  for (const space of assembly.spaces) {
    for (const local of materializeSpace(space).cells) {
      cellAt(project(world(space, local))).links = [...local.links];
    }
  }
  for (const link of assembly.connections) {
    const from = project(world(spaces.get(link.from.spaceId)!, link.from));
    const to = project(world(spaces.get(link.to.spaceId)!, link.to));
    cellAt(from).links.push(link.direction);
    cellAt(to).links.push(opposite(link.direction));
  }
  const rooms = assignModuleRoles(assembly.spaces.filter(space => space.kind === 'room').map(space => ({
    id: space.id, ...project(space.origin), rows: space.rows, columns: space.columns,
    center: project(world(space, { row: Math.floor(space.rows / 2), column: Math.floor(space.columns / 2) })),
  })), assembly.joins, recipe.seed);
  const connections: MazeRoomConnection[] = assembly.joins.map(join => {
    const from = spaces.get(join.fromRoomId)!;
    const to = spaces.get(join.toRoomId)!;
    const fromDoor = project(world(from, boundary(from, join.direction)));
    const toDoor = project(world(to, boundary(to, opposite(join.direction))));
    return { id: join.id, fromRoomId: join.fromRoomId, toRoomId: join.toRoomId, kind: 'tree',
      fromDoor, toDoor, path: orthogonalPath([fromDoor, toDoor]), width: 1 };
  });
  const start = rooms.find(room => room.kind === 'start')!.center;
  const end = rooms.find(room => room.kind === 'exit')!.center;
  const maze: MazeState = { rows: quality.rows, columns: quality.columns, start, end, active: { ...start },
    visited: [{ ...start }], cells, layout: { version: 'structured-v3', rooms, connections, zones: [], mainPath: [],
      assembly: { recipe: structuredClone(recipe), origin: { ...quality.origin }, schematic: 'stone-room-v1' } } };
  const path = findPath(maze, end, start);
  if (!path) throw new Error('Disconnected module floor projection');
  let position = start;
  maze.layout!.mainPath = [start, ...path.directions.map(direction => (position = movePosition(position, direction)))];
  return revealMazeVisibility(maze);
}
