import { createNewGameState } from '../../src/domain/gameFactory';
import { seededRng } from '../../src/domain/automation/autopilotTestFixtures';
import { generateMaze } from '../../src/domain/maze/generate';
import { generateStructuredMaze } from '../../src/domain/maze/structuredGenerate';
import { movePosition, opposite } from '../../src/domain/maze/movement';
import type { GameState, GridPosition, MazeRoomState } from '../../src/domain/types';
import { guildContractsForFloor } from '../../src/domain/guild/contracts';
import { acceptGuildContract, syncGuildQuests } from '../../src/domain/quests/quests';

export const inside = (p: GridPosition, r: MazeRoomState) => p.row >= r.row && p.row < r.row + r.rows
  && p.column >= r.column && p.column < r.column + r.columns;
export const safeRoom = (r: MazeRoomState) => r.tags.includes('safe') || ['start', 'hub', 'safe'].includes(r.kind);

export function boundary(game: GameState) {
  const { maze } = game;
  for (const room of maze.layout!.rooms.filter(safeRoom)) {
    for (const door of maze.cells.filter(cell => inside(cell, room))) {
      for (const direction of door.links) {
        const outside = movePosition(door, direction), inner = movePosition(door, opposite(direction));
        const atStairs = [inner, door, outside].some(p => [maze.start, maze.end].some(s => s.row === p.row && s.column === p.column));
        if (atStairs || inside(outside, room) || !inside(inner, room) || !door.links.includes(opposite(direction))) continue;
        if (maze.layout!.rooms.some(r => inside(outside, r))) continue; // A real connecting passage, not a safe-to-safe join.
        return { roomId: room.id, inner, door: { row: door.row, column: door.column }, outside, direction };
      }
    }
  }
  throw new Error('Fixed v3 seed has no safe room / passage boundary');
}

export function fixtureGame(scenario: string): GameState {
  const random = Math.random;
  Math.random = seededRng(20261011);
  try {
    let game = createNewGameState({ id: 'd1-rpg-browser', randomBattles: false, autoThrottleMs: 2000,
      ...(scenario === 'classic' ? { maze: generateMaze(9, 13, seededRng(42)) } : {}),
      ...(['v1', 'v2'].includes(scenario) ? { maze: generateStructuredMaze(15, 19, seededRng(42)) } : {}),
    });
    if (scenario === 'v1') {
      // Synthetic retained-v1 envelope, not a historical v1 generator claim.
      game.maze.layout = { ...game.maze.layout!, version: 'structured-v1', connections: undefined };
    }
    game = { ...game, mode: 'manual', randomBattles: scenario.startsWith('safe-'), autoThrottleMs: 2000,
      party: game.party.map(actor => ({ ...actor, autoBattle: false })),
    };
    if (scenario === 'v1' || scenario === 'v2') {
      // An explicitly accepted old-save objective, not automatic policy during load.
      const contract = guildContractsForFloor(game).find(c => c.task.objective === 'fetch');
      if (!contract) throw new Error('Legacy fixture needs a fetch contract');
      game = acceptGuildContract(game, contract.id);
    }
    if (scenario.startsWith('safe-')) {
      const edge = boundary(game);
      game.maze = { ...game.maze, active: scenario === 'safe-manual' ? edge.outside : edge.inner };
      // Bounded objective setup only: generated geometry/tags and all game owners stay intact.
      game.chests = [{ id: 'd1-boundary-target', level: 1, position: edge.outside, opened: false }];
      game.quests = syncGuildQuests(game).quests.map(q => ({ ...q, status: 'claimed', task: { ...q.task, progress: q.task.required },
        completedAt: game.createdAt, claimedAt: game.createdAt }));
    }
    return game;
  } finally { Math.random = random; }
}
