import type { GameState, GridPosition, MazeRoomState } from '../types';

export function isInRoom(position: GridPosition, room: MazeRoomState) {
  return position.row >= room.row && position.column >= room.column
    && position.row < room.row + room.rows && position.column < room.column + room.columns;
}

export function roomAtPosition(game: GameState, position = game.maze.active) {
  // Legacy layouts can overlap. Prefer a hostile room for encounter attribution.
  const rooms = game.maze.layout?.rooms.filter((room) => isInRoom(position, room)) ?? [];
  return rooms.find((room) => room.kind === 'boss') ?? rooms[0];
}
