import type { Direction, GameState, GridPosition, MazeRoomState, QuestState } from '../types';
import { activeUnopenedChests } from '../items/chests';
import { samePosition } from '../maze/key';
import { findPath, pathDistance, type MazePath } from '../maze/solver';

export type AutoTargetKind = 'quest-fetch' | 'quest-kill' | 'quest-locate' | 'quest-scout' | 'chest' | 'exit';

export interface AutoTarget {
  id: string;
  kind: AutoTargetKind;
  position: GridPosition;
  priority: number;
  reason: string;
  questId?: string;
  chestId?: string;
}

export interface PlannedAutoTarget {
  target: AutoTarget;
  path: MazePath;
  score: number;
}

export type AutoIntent =
  | { type: 'move'; direction: Direction; plan: PlannedAutoTarget }
  | { type: 'interact'; plan: PlannedAutoTarget }
  | { type: 'battle'; quest: QuestState }
  | { type: 'idle'; reason: string };

const QUEST_PRIORITY: Record<QuestState['task']['objective'], number> = {
  fetch: 1000,
  kill: 900,
  scout: 800,
  locate: 700,
};

export function nextAutoIntent(game: GameState): AutoIntent {
  if (game.battle?.status === 'active') {
    return { type: 'idle', reason: 'battle is already active' };
  }

  const killQuest = activeKillQuestAtPosition(game);
  if (killQuest) {
    return { type: 'battle', quest: killQuest };
  }

  const plan = chooseAutoTarget(game, deriveAutoTargets(game));
  if (!plan) {
    return { type: 'idle', reason: 'no reachable auto target' };
  }

  if (plan.path.distance === 0) {
    return plan.target.kind === 'chest' || plan.target.kind === 'quest-fetch' ? { type: 'interact', plan } : { type: 'idle', reason: `already at ${plan.target.reason}` };
  }

  return { type: 'move', direction: plan.path.directions[0], plan };
}

export function deriveAutoTargets(game: GameState): AutoTarget[] {
  const questTargets = activeQuestTargets(game);
  const chestTargets = activeUnopenedChests(game).map<AutoTarget>((chest) => ({
    id: `chest:${chest.id}`,
    kind: 'chest',
    position: chest.position,
    priority: 500,
    reason: 'unopened chest',
    chestId: chest.id,
  }));

  const batchedChests = applyChestBatching(game, chestTargets, questTargets);
  const hasOpenFloorWork = game.quests.some((quest) => quest.floor === game.dungeonLevel && quest.status === 'active') || batchedChests.length > 0;
  const exitTarget: AutoTarget[] = hasOpenFloorWork
    ? []
    : [
        {
          id: `exit:${game.dungeonLevel}`,
          kind: 'exit',
          position: game.maze.end,
          priority: 0,
          reason: 'descent stairs',
        },
      ];

  return [...questTargets, ...batchedChests, ...exitTarget];
}

export function chooseAutoTarget(game: GameState, targets: AutoTarget[]): PlannedAutoTarget | undefined {
  const planned = targets
    .map((target) => {
      const path = findPath(game.maze, target.position);
      return path ? { target, path, score: scoreTarget(target, path) } satisfies PlannedAutoTarget : undefined;
    })
    .filter((target): target is PlannedAutoTarget => Boolean(target));

  return planned.sort((a, b) => a.score - b.score || b.target.priority - a.target.priority || a.path.distance - b.path.distance || a.target.id.localeCompare(b.target.id))[0];
}

function activeQuestTargets(game: GameState): AutoTarget[] {
  return game.quests
    .filter((quest) => quest.floor === game.dungeonLevel && quest.status === 'active')
    .map((quest) => questTargetForQuest(game, quest))
    .filter((target): target is AutoTarget => Boolean(target));
}

function questTargetForQuest(game: GameState, quest: QuestState): AutoTarget | undefined {
  const room = game.maze.layout?.rooms.find((item) => item.id === quest.targetRoomId);
  if (!room) {
    return undefined;
  }

  if (quest.task.objective === 'fetch') {
    const chest = activeUnopenedChests(game).find((item) => isInRoom(item.position, room));
    return {
      id: `quest:${quest.id}`,
      kind: 'quest-fetch',
      position: chest?.position ?? room.center,
      priority: QUEST_PRIORITY.fetch,
      reason: quest.title,
      questId: quest.id,
      chestId: chest?.id,
    };
  }

  return {
    id: `quest:${quest.id}`,
    kind: `quest-${quest.task.objective}` as AutoTargetKind,
    position: room.center,
    priority: QUEST_PRIORITY[quest.task.objective],
    reason: quest.title,
    questId: quest.id,
  };
}

function applyChestBatching(game: GameState, chests: AutoTarget[], questTargets: AutoTarget[]) {
  const objectives = questTargets.filter((target) => target.kind !== 'quest-kill');
  if (objectives.length === 0) {
    return chests;
  }

  return chests.map((chest) => {
    const isQuestChest = questTargets.some((target) => samePosition(target.position, chest.position));
    if (isQuestChest) {
      return chest;
    }

    const bestDetour = Math.min(
      ...objectives.map((objective) => {
        const activeToObjective = pathDistance(game.maze, objective.position);
        const activeToChest = pathDistance(game.maze, chest.position);
        const chestToObjective = pathDistance(game.maze, objective.position, chest.position);
        return activeToChest + chestToObjective - activeToObjective;
      }),
    );

    if (bestDetour <= 2) {
      return {
        ...chest,
        priority: chest.priority + 500,
        reason: 'near current objective',
      };
    }

    return chest;
  });
}

function activeKillQuestAtPosition(game: GameState) {
  return game.quests.find((quest) => {
    if (quest.floor !== game.dungeonLevel || quest.status !== 'active' || quest.task.objective !== 'kill') {
      return false;
    }

    const room = game.maze.layout?.rooms.find((item) => item.id === quest.targetRoomId);
    return Boolean(room && isInRoom(game.maze.active, room));
  });
}

function scoreTarget(target: AutoTarget, path: MazePath) {
  return path.distance * 10 - target.priority;
}

function isInRoom(position: GridPosition, room: MazeRoomState) {
  return position.row >= room.row && position.column >= room.column && position.row < room.row + room.rows && position.column < room.column + room.columns;
}
