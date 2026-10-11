import { createNewGameState } from '../../gameFactory';
import { chestAt, lineMaze, roomAt } from '../../automation/autopilotTestFixtures';
import type { GameState } from '../../types';
import { observeRpg, projectRpgKnowledge, type RpgKnowledge, type RpgObservation } from './index';

export const address = (column: number, floor = 1, row = 0) => ({ floor, row, column });
export const time = (second = 0) => new Date(Date.UTC(2026, 9, 11, 0, 0, second)).toISOString();
export const identity = (revision = 1) => ({ id: `observation-${revision}`, observedAt: time(revision),
  revision: { owner: 'controller', epoch: 1, revision } });
export const routeBudget = { maxVisits: 512, maxSteps: 256 };

export function fixture(columns = 20, radius = 2): GameState {
  const maze = lineMaze(columns, [roomAt('entrance', 'start', 0), roomAt('visible', 'treasure', 1),
    roomAt('hidden', 'boss', columns - 1)]);
  const game = createNewGameState({ id: 'knowledge-fixture', maze, randomBattles: false, chests: [chestAt(1), chestAt(columns - 1)] });
  return { ...game, maze: { ...maze, visibility: { radius, explored: maze.cells.map(({ row, column }) => ({ row, column })) } } };
}

export function observed(game = fixture(), revision = 1): RpgObservation {
  const result = observeRpg(game, identity(revision));
  if (result.status !== 'observed') throw new Error(`Observation failed: ${result.reason}`);
  return result;
}

export function projected(observation = observed(), previous?: RpgKnowledge): RpgKnowledge {
  const result = projectRpgKnowledge(previous, observation);
  if (result.status !== 'known') throw new Error(`Projection failed: ${result.reason}`);
  return result;
}
