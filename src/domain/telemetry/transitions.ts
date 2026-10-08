import type { GameState, ItemInstance } from '../types';
import type { PlayCounters, PlayTelemetry, TransitionContext } from './types';
import { itemQuantity, stackIdentity } from '../items/itemStacks';

export const MAX_PLAY_EVENTS = 600;

export function createPlayTelemetry(gameId: string, now = Date.now()): PlayTelemetry {
  const at = new Date(now).toISOString();
  return {
    version: 1, gameId, startedAt: at, updatedAt: at, sequence: 0,
    counters: emptyCounters(), sources: { manual: 0, auto: 0, system: 0 }, actions: {}, events: [],
  };
}

export function recordTransition(
  current: PlayTelemetry, before: GameState, after: GameState, context: TransitionContext, now = Date.now(),
): PlayTelemetry {
  const log = current.gameId === after.id ? current : createPlayTelemetry(after.id, now);
  const changes = transitionChanges(before, after, context);
  const progress = Object.entries(changes).some(([key, value]) => value > 0 && !['actions', 'noProgress', 'totalDecisionMs', 'maxDecisionMs'].includes(key));
  if (!progress) changes.noProgress = 1;
  const elapsed = Math.max(0, context.elapsedMs ?? 0);
  const counters = { ...log.counters };
  for (const [key, value] of Object.entries(changes)) counters[key as keyof PlayCounters] += value;
  counters.totalDecisionMs += elapsed;
  counters.maxDecisionMs = Math.max(counters.maxDecisionMs, elapsed);
  const at = new Date(now).toISOString();
  const sequence = log.sequence + 1;
  // Keep waiting ticks in counters; sample them so useful events survive a long cooldown.
  const previous = log.events.at(-1);
  const keepEvent = progress || context.source !== 'auto' || sequence % 20 === 0
    || previous?.action !== context.action || previous?.reason !== after.autopilot?.reason;
  const event = {
    ...context, sequence, at, floor: after.dungeonLevel, mode: after.mode,
    phase: after.autopilot?.phase,
    position: { ...after.maze.active }, objective: after.autopilot?.targetId,
    reason: after.autopilot?.reason, progress, changes,
  };
  return {
    ...log, updatedAt: at, sequence, counters,
    sources: { ...log.sources, [context.source]: log.sources[context.source] + 1 },
    actions: { ...log.actions, [context.action]: (log.actions[context.action] ?? 0) + 1 },
    events: keepEvent ? [...log.events, event].slice(-MAX_PLAY_EVENTS) : log.events,
  };
}

function transitionChanges(before: GameState, after: GameState, context: TransitionContext): Partial<PlayCounters> {
  const changes: Partial<PlayCounters> = { actions: 1 };
  const moved = before.dungeonLevel === after.dungeonLevel
    && (before.maze.active.row !== after.maze.active.row || before.maze.active.column !== after.maze.active.column);
  if (moved) {
    changes.moves = 1;
    if (before.maze.visited.some(p => p.row === after.maze.active.row && p.column === after.maze.active.column)) changes.revisits = 1;
  }
  if (after.dungeonLevel > before.dungeonLevel) {
    changes.descents = 1;
    if (before.chests.some(c => c.level === before.dungeonLevel && !c.opened)
      || before.quests.some(q => q.floor === before.dungeonLevel && q.status === 'active')) changes.prematureDescents = 1;
  }
  if (after.autopilot?.phase === 'blocked' && before.autopilot?.phase !== 'blocked') changes.blocked = 1;
  const opened = new Set(before.chests.filter(c => c.opened).map(c => c.id));
  changes.chests = after.chests.filter(c => c.opened && !opened.has(c.id)).length;
  const completed = new Set(before.quests.filter(q => q.status !== 'active').map(q => q.id));
  changes.quests = after.quests.filter(q => q.status !== 'active' && !completed.has(q.id)).length;
  const combatAction = ['battle-tick', 'round', 'skill'].includes(context.action);
  if (before.battle?.status === 'active') {
    if (!after.battle && combatAction && after.mode !== 'town') changes.battlesWon = 1;
    if (after.battle?.status === 'lost') changes.battlesLost = 1;
    if (combatAction) changes.kills = Math.max(0, before.battle.enemies.length - (after.battle?.enemies.length ?? 0));
  }
  const gold = after.inventory.gold - before.inventory.gold;
  changes.goldGained = Math.max(0, gold);
  changes.goldSpent = Math.max(0, -gold);
  const oldItems = quantities([...before.inventory.items, ...before.stash.items]);
  const newItems = quantities([...after.inventory.items, ...after.stash.items]);
  changes.itemsAdded = 0;
  changes.itemsRemoved = 0;
  for (const id of new Set([...oldItems.keys(), ...newItems.keys()])) {
    const delta = (newItems.get(id) ?? 0) - (oldItems.get(id) ?? 0);
    changes.itemsAdded += Math.max(0, delta);
    changes.itemsRemoved += Math.max(0, -delta);
  }
  if (after.mode === 'town' && before.mode !== 'town') {
    changes.portalsUsed = Math.max(0, portalQuantity(before) - portalQuantity(after));
  }
  changes.damageTaken = 0;
  changes.healing = 0;
  for (const actor of after.party) {
    const old = before.party.find(a => a.id === actor.id);
    if (!old) continue;
    changes.damageTaken += Math.max(0, old.hp - actor.hp);
    changes.healing += Math.max(0, actor.hp - old.hp);
  }
  return Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== 0));
}

function quantities(items: ItemInstance[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    // Moving and consolidating a consumable stack may change its ID, not ownership.
    const key = !item.slot && item.category === 'consumable' ? stackIdentity(item, false) : item.id;
    counts.set(key, (counts.get(key) ?? 0) + itemQuantity(item));
  }
  return counts;
}

function portalQuantity(game: GameState) {
  return game.inventory.items.filter(i => i.consumableEffect === 'townPortal').reduce((n, i) => n + (i.quantity ?? 1), 0);
}

function emptyCounters(): PlayCounters {
  return {
    actions: 0, moves: 0, revisits: 0, noProgress: 0, blocked: 0, descents: 0, prematureDescents: 0,
    chests: 0, quests: 0, battlesWon: 0, battlesLost: 0, kills: 0, itemsAdded: 0, itemsRemoved: 0,
    goldGained: 0, goldSpent: 0, portalsUsed: 0, damageTaken: 0, healing: 0, totalDecisionMs: 0, maxDecisionMs: 0,
  };
}
