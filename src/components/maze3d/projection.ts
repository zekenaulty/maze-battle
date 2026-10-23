import type { Direction, MazeRoomState, MazeState } from '../../domain/types';
import { cellKey } from '../../domain/maze/key';
import { movePosition } from '../../domain/maze/movement';
import type { MazeVisibilitySnapshot } from '../../domain/maze/visibility';
import { isMazeFloorCell } from '../maze/mazeFloor';

export type ProjectedBoundary = 'wall' | 'doorway' | 'open';
export type ProjectedExits = Record<Direction, ProjectedBoundary>;

export interface ProjectedCell3D {
  row: number;
  column: number;
  roomId?: string;
  roomKind?: MazeRoomState['kind'];
  exits: ProjectedExits;
}

export const PROJECTION_CELL_SIZE = 8;
export const PROJECTION_WALL_HEIGHT = 5;
export const PROJECTION_DOOR_WIDTH = 3;
export const PROJECTION_DOOR_HEIGHT = 3.3;

const directions: Direction[] = ['north', 'east', 'south', 'west'];

function roomAt(maze: MazeState, row: number, column: number) {
  return maze.layout?.rooms.find(room =>
    row >= room.row && row < room.row + room.rows &&
    column >= room.column && column < room.column + room.columns);
}

/** Pure read-only projection; never creates, saves, or changes a gameplay cell. */
export function projectMaze3D(
  maze: MazeState,
  visibility: MazeVisibilitySnapshot,
  radius = 4,
): ProjectedCell3D[] {
  const boundedRadius = Math.max(0, Math.floor(radius));
  const present = new Map(maze.cells
    .filter(cell => isMazeFloorCell(maze, cell))
    .filter(cell => visibility.visible.has(cellKey(cell)))
    .filter(cell => Math.abs(cell.row - maze.active.row) <= boundedRadius &&
      Math.abs(cell.column - maze.active.column) <= boundedRadius)
    .map(cell => [cellKey(cell), cell]));

  return [...present.values()].map(cell => {
    const room = roomAt(maze, cell.row, cell.column);
    const exits: ProjectedExits = { north: 'wall', east: 'wall', south: 'wall', west: 'wall' };
    for (const direction of directions) {
      if (!cell.links.includes(direction)) continue;
      const neighbor = movePosition(cell, direction);
      if (!present.has(cellKey(neighbor))) continue;
      const neighborRoom = roomAt(maze, neighbor.row, neighbor.column);
      exits[direction] = room && neighborRoom && room.id === neighborRoom.id ? 'open' : 'doorway';
    }
    return {
      row: cell.row,
      column: cell.column,
      roomId: room?.id,
      roomKind: room?.kind,
      exits,
    };
  }).sort((a, b) => a.row - b.row || a.column - b.column);
}
