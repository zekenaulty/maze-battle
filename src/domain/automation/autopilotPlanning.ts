import type { Direction, GameState, GridPosition, QuestState } from '../types';
import { activeUnopenedChests } from '../items/chests';
import { cellKey, samePosition } from '../maze/key';
import { canMove, movePosition } from '../maze/movement';
import { createMazePathSearch, type MazePath } from '../maze/solver';
import { isInRoom } from '../quests/questTargets';
import { QUEST_PRIORITY, autoScore, compareAutoTargets } from './autoPolicy';

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
  | { type: 'descend'; plan: PlannedAutoTarget }
  | { type: 'battle'; quest: QuestState }
  | { type: 'idle'; reason: string };

export function nextAutoIntent(game: GameState): AutoIntent {
  if (game.battle?.status === 'active') return { type: 'idle', reason: 'Battle is already active.' };
  const problem = invalidObjectiveReason(game);
  if (problem) return { type: 'idle', reason: problem };

  const killQuest = game.quests.find((quest) => {
    const room = game.maze.layout?.rooms.find((item) => item.id === quest.targetRoomId);
    return quest.floor === game.dungeonLevel && quest.status === 'active' && quest.task.objective === 'kill'
      && room && isInRoom(game.maze.active, room);
  });
  if (killQuest) return { type: 'battle', quest: killQuest };

  const targets = deriveAutoTargets(game);
  const plan = resumeAutoTarget(game, targets) ?? chooseAutoTarget(game, targets);
  if (!plan) return { type: 'idle', reason: 'No reachable target; floor work or descent is blocked.' };
  if (plan.path.distance > 0) return { type: 'move', direction: plan.path.directions[0], plan };
  return plan.target.kind === 'exit' ? { type: 'descend', plan } : { type: 'interact', plan };
}

export function deriveAutoTargets(game: GameState): AutoTarget[] {
  const quests = game.quests.filter((quest) => quest.floor === game.dungeonLevel && quest.status === 'active');
  const targets = quests.flatMap((quest): AutoTarget[] => {
    const room = game.maze.layout?.rooms.find((item) => item.id === quest.targetRoomId);
    if (!room) return [];
    const chest = quest.task.objective === 'fetch'
      ? activeUnopenedChests(game).find((item) => isInRoom(item.position, room)) : undefined;
    if (quest.task.objective === 'fetch' && !chest) return [];
    return [{
      id: `quest:${quest.id}`, kind: `quest-${quest.task.objective}`, position: chest?.position ?? room.center,
      priority: QUEST_PRIORITY[quest.task.objective], reason: quest.title, questId: quest.id, chestId: chest?.id,
    }];
  });
  targets.push(...activeUnopenedChests(game).map<AutoTarget>((chest) => ({
    id: `chest:${chest.id}`, kind: 'chest', position: chest.position, priority: 500, reason: 'Unopened chest', chestId: chest.id,
  })));
  if (quests.length === 0 && targets.length === 0) targets.push({
    id: `exit:${game.dungeonLevel}`, kind: 'exit', position: game.maze.end, priority: 0, reason: 'Descent stairs',
  });
  return targets;
}

export function chooseAutoTarget(game: GameState, targets: AutoTarget[]): PlannedAutoTarget | undefined {
  if (!targets.length) return undefined;
  const paths = createMazePathSearch(game.maze);
  const ranked = targets.map((target) => ({ target, distance: paths.distanceTo(target.position) }))
    .filter((entry) => Number.isFinite(entry.distance))
    .sort((a, b) => compareAutoTargets({ ...a.target, distance: a.distance }, { ...b.target, distance: b.distance }));
  const best = ranked[0];
  if (!best) return undefined;
  const path = paths.pathTo(best.target.position)!;

  // Collect caches along the chosen route without pairwise target-to-target searches.
  if (best.target.kind.startsWith('quest-')) {
    const chests = new Map(targets.filter((target) => target.kind === 'chest').map((target) => [cellKey(target.position), target]));
    let position = game.maze.active;
    for (let index = 0; index < path.distance; index++) {
      const chest = chests.get(cellKey(position));
      if (chest) {
        const batched = { ...chest, priority: best.target.priority + 1, reason: `Chest on route to ${best.target.reason}` };
        return { target: batched, path: { target: chest.position, distance: index, directions: path.directions.slice(0, index) }, score: score(batched, index) };
      }
      position = movePosition(position, path.directions[index]);
    }
  }
  return { target: best.target, path, score: score(best.target, path.distance) };
}

function resumeAutoTarget(game: GameState, targets: AutoTarget[]): PlannedAutoTarget | undefined {
  const state = game.autopilot;
  if (!state || state.floor !== game.dungeonLevel || state.phase === 'blocked'
    || !state.lastPosition || !samePosition(state.lastPosition, game.maze.active)) return undefined;
  const target = targets.find((item) => item.id === state.targetId);
  if (!target || !state.targetPosition || !samePosition(target.position, state.targetPosition)) return undefined;
  if (!state.route.length && !samePosition(game.maze.active, target.position)) return undefined;
  if (state.route.length && (!canMove(game.maze, state.route[0])
    || !game.maze.cells.some((cell) => samePosition(cell, movePosition(game.maze.active, state.route[0]))))) return undefined;
  return { target, path: { target: target.position, directions: state.route, distance: state.route.length }, score: score(target, state.route.length) };
}

function invalidObjectiveReason(game: GameState) {
  for (const quest of game.quests.filter((item) => item.floor === game.dungeonLevel && item.status === 'active')) {
    const room = game.maze.layout?.rooms.find((item) => item.id === quest.targetRoomId);
    if (!room) return `Missing target room for ${quest.title}.`;
    if (!Number.isFinite(quest.task.required) || quest.task.required <= 0) return `Invalid objective count for ${quest.title}.`;
    if (quest.task.objective === 'fetch' && !game.chests.some((chest) => chest.level === quest.floor && isInRoom(chest.position, room))) {
      return `Missing obtainable chest for ${quest.title}.`;
    }
  }
}

function score(target: AutoTarget, distance: number) {
  return autoScore(target.priority, distance);
}
