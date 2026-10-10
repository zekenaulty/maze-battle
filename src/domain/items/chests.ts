import type { ChestState, GameState, GridPosition, MazeState } from '../types';
import { samePosition } from '../maze/key';
import type { Rng } from '../combat/rng';
import { rollLoot } from './loot';
import { addItemsToInventory } from './inventory';
import { recordFetchQuestProgress } from '../quests/quests';

export function generateChestsForMaze(level: number, maze: MazeState): ChestState[] {
  const candidates = maze.cells.filter((cell) => !samePosition(cell, maze.start) && !samePosition(cell, maze.end) && cell.links.length > 0);
  const treasureRooms = maze.layout?.rooms.filter((room) => room.kind === 'treasure').map((room) => room.center) ?? [];
  const count = Math.min(3, Math.max(1, Math.floor(candidates.length / 28) + 1));
  const chests: ChestState[] = [];

  for (const candidate of treasureRooms) {
    if (chests.length >= count) {
      break;
    }

    chests.push({
      id: chestId(level, candidate),
      level,
      position: { row: candidate.row, column: candidate.column },
      opened: false,
    });
  }

  for (let index = chests.length; index < count && candidates.length > 0; index++) {
    const candidate = candidates[(level * 17 + index * 23) % candidates.length];
    if (chests.some((chest) => samePosition(chest.position, candidate))) {
      continue;
    }

    chests.push({
      id: chestId(level, candidate),
      level,
      position: { row: candidate.row, column: candidate.column },
      opened: false,
    });
  }

  return chests;
}

export function normalizeChests(chests: Partial<ChestState>[] | undefined, level: number, maze: MazeState) {
  const normalized = (chests ?? []).map((chest) => ({
    id: chest.id ?? chestId(chest.level ?? level, chest.position ?? maze.start),
    level: chest.level ?? level,
    position: chest.position ?? maze.start,
    opened: chest.opened ?? false,
    loot: chest.loot,
  }));

  if (normalized.some((chest) => chest.level === level)) {
    return normalized;
  }

  return [...normalized, ...generateChestsForMaze(level, maze)];
}

export function activeUnopenedChests(game: GameState) {
  return game.chests.filter((chest) => chest.level === game.dungeonLevel && !chest.opened);
}

export function openChestAtActivePosition(game: GameState, rng: Rng): GameState {
  const chest = game.chests.find((candidate) => candidate.level === game.dungeonLevel && !candidate.opened && samePosition(candidate.position, game.maze.active));
  if (!chest) {
    return game;
  }

  const loot = rollLoot({ source: 'chest', level: game.dungeonLevel }, rng);
  const opened = {
    ...game,
    chests: game.chests.map((candidate) => (candidate.id === chest.id ? { ...candidate, opened: true, loot } : candidate)),
  };

  return recordFetchQuestProgress(addItemsToInventory(opened, loot, 'Chest opened'), chest.position);
}

export function ensureFloorChests(game: GameState) {
  if (game.chests.some((chest) => chest.level === game.dungeonLevel)) {
    return game;
  }

  return {
    ...game,
    chests: [...game.chests, ...generateChestsForMaze(game.dungeonLevel, game.maze)],
  };
}

function chestId(level: number, position: GridPosition) {
  return `chest-${level}-${position.row}-${position.column}`;
}
