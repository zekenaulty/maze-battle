import type { Direction, GameState, GridPosition, MazeState } from '../domain/types';
import { createMazeVisibilitySnapshot, type MazeVisibilitySnapshot } from '../domain/maze/visibility';

export interface MazeViewModel {
  chests: GridPosition[];
  facing: Direction;
  maze: MazeState;
  visibility: MazeVisibilitySnapshot;
}

export function createMazeViewModel(game: GameState, chests: GridPosition[]): MazeViewModel {
  return {
    chests,
    facing: game.facing,
    maze: game.maze,
    visibility: createMazeVisibilitySnapshot(game.maze),
  };
}
