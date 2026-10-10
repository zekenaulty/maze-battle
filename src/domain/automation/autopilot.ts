import type { GameState } from '../types';
import { descendFloor, moveActive } from '../gameFactory';
import { startBattle } from '../combat/battleEngine';
import { defaultRng, type Rng } from '../combat/rng';
import { shouldStartEncounter } from '../combat/encounters';
import { openChestAtActivePosition } from '../items/chests';
import { samePosition } from '../maze/key';
import { syncGuildQuests } from '../quests/quests';
import { nextAutoIntent, type PlannedAutoTarget } from './autopilotPlanning';
import { blockAutopilot, planningState } from './autopilotState';

export { chooseAutoTarget, deriveAutoTargets, nextAutoIntent } from './autopilotPlanning';
export type { AutoIntent, AutoTarget, AutoTargetKind, PlannedAutoTarget } from './autopilotPlanning';
export { stopAutopilot } from './autopilotState';

// One bounded exploration action. The host advances combat and town care separately.
export function advanceAutopilot(game: GameState, rng: Rng = defaultRng, now = Date.now()): GameState {
  if (game.mode !== 'auto-play' || game.battle?.status === 'active') return game;
  if (game.party.every((actor) => actor.hp <= 0) || game.battle?.status === 'lost') {
    return stamp(blockAutopilot(game, 'Party defeated; recover before resuming.'), now);
  }

  let next = syncGuildQuests(game);
  if (!next.autopilot || next.autopilot.floor !== next.dungeonLevel || next.autopilot.phase === 'blocked') {
    next = { ...next, autopilot: planningState(next) };
  }

  const opened = openChestAtActivePosition(next, rng);
  if (opened !== next) return stamp({ ...opened, autopilot: { ...next.autopilot!, phase: 'interact', stalledTicks: 0, reason: 'Opened chest on route.' } }, now);

  const intent = nextAutoIntent(next);
  switch (intent.type) {
    case 'idle':
      return stamp(blockAutopilot(next, intent.reason), now);
    case 'battle': {
      const tags = intent.quest.task.monsterTags;
      const battle = startBattle(tags?.length ? { ...next, monsterTags: tags } : next, rng);
      if (tags?.length && !battle.battle?.enemies.some((enemy) => enemy.tags.some((tag) => tags.includes(tag)))) {
        return stamp(blockAutopilot(next, `No matching encounter available for ${intent.quest.title}.`), now);
      }
      return stamp({
        ...battle, monsterTags: next.monsterTags,
        battle: { ...battle.battle!, origin: { floor: next.dungeonLevel, roomId: intent.quest.targetRoomId, position: { ...next.maze.active } } },
        autopilot: { ...next.autopilot!, phase: 'combat', targetId: `quest:${intent.quest.id}`, targetPosition: { ...next.maze.active }, route: [], stalledTicks: 0, reason: intent.quest.title },
      }, now);
    }
    case 'move': {
      const moving = withPlan(next, intent.plan);
      const moved = moveActive(moving, intent.direction, { triggerStairs: false });
      if (samePosition(moved.maze.active, next.maze.active)) return stamp(blockAutopilot(moving, `Route made no progress toward ${intent.plan.target.reason}.`), now);
      const route = intent.plan.path.directions.slice(1);
      const progressed: GameState = {
        ...moved,
        autopilot: { ...moving.autopilot!, phase: route.length ? 'travel' : 'interact', route, lastPosition: { ...moved.maze.active }, stalledTicks: 0 },
      };
      const withChest = openChestAtActivePosition(progressed, rng);
      if (withChest.randomBattles && shouldStartEncounter(rng)) {
        const encountered = startBattle(withChest, rng);
        return stamp({ ...encountered, autopilot: { ...withChest.autopilot!, phase: 'combat', reason: 'Random encounter on route.' } }, now);
      }
      return stamp(withChest, now);
    }
    case 'interact': {
      const ready = syncGuildQuests(openChestAtActivePosition(withPlan(next, intent.plan), rng));
      const completed = intent.plan.target.questId
        ? ready.quests.find((quest) => quest.id === intent.plan.target.questId)?.status !== 'active'
        : ready.chests.find((chest) => chest.id === intent.plan.target.chestId)?.opened;
      return stamp(completed ? { ...ready, autopilot: planningState(ready, `Completed ${intent.plan.target.reason}.`) }
        : blockAutopilot(ready, `Interaction made no progress: ${intent.plan.target.reason}.`), now);
    }
    case 'descend': {
      const descended = descendFloor(withPlan(next, intent.plan), rng);
      return stamp(descended.dungeonLevel !== next.dungeonLevel
        ? { ...descended, autopilot: planningState(descended, `Floor ${next.dungeonLevel} complete; descended.`) }
        : blockAutopilot(descended, 'Descent blocked by unfinished floor work.'), now);
    }
  }
}

function withPlan(game: GameState, plan: PlannedAutoTarget): GameState {
  return {
    ...game,
    autopilot: {
      phase: plan.path.distance ? 'travel' : 'interact', floor: game.dungeonLevel,
      targetId: plan.target.id, targetPosition: { ...plan.target.position }, route: [...plan.path.directions],
      lastPosition: { ...game.maze.active }, stalledTicks: game.autopilot?.stalledTicks ?? 0, reason: plan.target.reason,
    },
  };
}

function stamp(game: GameState, now: number): GameState {
  return { ...game, updatedAt: new Date(now).toISOString() };
}
