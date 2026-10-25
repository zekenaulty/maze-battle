import { compareAutoTargets, QUEST_PRIORITY } from '../../../domain/automation/autoPolicy';
import { shortestRoutes } from '../../../domain/expedition/shortestRoutes';
import { movePosition, opposite } from '../../../domain/maze/movement';
import type { CanonicalPages } from '../pages';
import type { GameCheckpoint } from '../game/checkpoint';
import { cellKey } from '../knowledge/keys';
import { DIRECTIONS, type RememberedCell } from '../knowledge/types';
import type { EarnedRoom } from '../knowledge/roomView';
import type { KnownStep } from '../knowledge/navigation';
import { same } from '../world/records';
import type { WorldPosition } from '../world/types';
import { saveAutoRoom } from './records';
import { objectiveHop } from './waypoints';
import { AutoBlocked, AUTO_LIMITS, type AutoRoom, type AutoState, type AutoRoute } from './types';
import type { AutoGuild } from './source';

interface Target { id: string; priority: number; at: WorldPosition; purpose: AutoRoute['purpose'] }

export function retainObjective(state: AutoState, guild: AutoGuild) {
  const active = guild.active;
  if (state.objective?.kind === 'quest' && active.some(q => q.id === state.objective!.id)) return;
  if (state.objective?.kind === 'exit' && state.completed && active.length === 0 && !guild.combatRequired) return;
  const next = [...active].sort((a, b) => QUEST_PRIORITY[b.task.objective] - QUEST_PRIORITY[a.task.objective] || a.id.localeCompare(b.id))[0];
  const objective = next ? { kind: 'quest' as const, id: next.id, roomId: next.targetRoomId } : null;
  if (!same(state.objective, objective)) { state.route = null; state.search = null; state.objective = objective; }
}

/** One bounded room search. Distant objectives use learned parent/child waypoints, not a floor graph. */
export async function planAutoRoute(pages: Pick<CanonicalPages, 'get' | 'set'>, checkpoint: GameCheckpoint, state: AutoState, room: AutoRoom, view: EarnedRoom, guild: AutoGuild) {
  const cells = new Map(view.region.cells.map(c => [cellKey(c.cell.at), c.cell]));
  const tree = shortestRoutes(cellKey(checkpoint.position), key => {
    const cell = cells.get(key)!;
    return DIRECTIONS.flatMap(direction => {
      const to = cell.edges[direction]?.target, next = to && cells.get(cellKey(to));
      return next && same(next.edges[opposite(direction)]?.target ?? null, cell.at) && same(movePosition(cell.world, direction), next.world)
        ? [{ key: cellKey(next.at), edge: { from: cell.at, to: next.at, direction } }] : [];
    });
  }, AUTO_LIMITS.cells);
  if (view.cells.some(c => !tree.has(cellKey(c.at)))) throw new AutoBlocked('Earned room contains unreachable work.');
  const distance = (at: WorldPosition) => tree.get(cellKey(at))?.distance ?? Infinity;
  const choose = (targets: Target[]) => targets.filter(t => Number.isFinite(distance(t.at)))
    .sort((a, b) => compareAutoTargets({ ...a, distance: distance(a.at) }, { ...b, distance: distance(b.at) }))[0];
  const route = (target: Target) => {
    const steps: KnownStep[] = [];
    for (let node = tree.get(cellKey(target.at))!; node.previous !== undefined; node = tree.get(node.previous)!) steps.push(node.edge!);
    steps.reverse();
    if (!steps.length) throw new AutoBlocked('Waypoint produced no spatial progress; further observation is required.');
    state.route = { source: { sequence: checkpoint.knowledge!.sequence, id: checkpoint.knowledge!.id },
      target: target.at, purpose: target.purpose, steps: steps.slice(0, AUTO_LIMITS.steps) };
  };
  const loot = view.cells.flatMap(cell => cell.chests.filter(c => !c.opened).map(chest => ({
    id: chest.id, at: cell.at, priority: guild.active.some(q => q.targetRoomId === room.spaceId && q.task.objective === 'fetch') ? QUEST_PRIORITY.fetch : 500,
    purpose: 'objective' as const,
  })));
  const hop = await objectiveHop(pages, state, room);
  if (hop === 'pending') { state.reason = 'Resolving bounded learned room waypoints.'; return; }
  if (hop) {
    const exit = view.exits.find(e => e.to.cell.spaceId === hop);
    if (!exit) throw new AutoBlocked('Objective waypoint has no earned exit.');
    const objective = guild.active.find(q => q.id === state.objective?.id);
    route(choose([...loot, { id: hop, at: exit.to, priority: objective ? QUEST_PRIORITY[objective.task.objective] : 0, purpose: 'objective' }])!); return;
  }
  if (loot.length) { route(choose(loot)!); return; }
  if (state.objective?.kind === 'exit' && state.descent?.cell.spaceId === room.spaceId) {
    route({ id: state.objective.id, at: state.descent, priority: 0, purpose: 'exit' }); return;
  }
  const frontier = choose(view.frontiers.map(c => ({ id: cellKey(c.at), at: c.at, priority: 100, purpose: 'explore' })));
  if (frontier) { route(frontier); return; }
  const children = view.exits.filter(e => e.to.cell.spaceId !== room.parent?.to.cell.spaceId && !room.completed.includes(e.to.cell.spaceId));
  const child = choose(children.map(e => ({ id: e.to.cell.spaceId, at: e.to, purpose: 'explore',
    priority: Math.max(100, ...guild.active.filter(q => q.targetRoomId === e.to.cell.spaceId).map(q => QUEST_PRIORITY[q.task.objective])) })));
  if (child) { route(child); return; }
  if (!room.closed) { room.closed = true; await saveAutoRoom(pages, room); }
  if (room.parent) {
    const parent = view.exits.find(e => same(e.from, room.parent!.from) && same(e.to, room.parent!.to) && e.direction === room.parent!.direction);
    if (!parent) throw new AutoBlocked('Backtracking requires an earned reciprocal parent exit.');
    route({ id: parent.to.cell.spaceId, at: parent.to, priority: 0, purpose: 'backtrack' }); return;
  }
  state.completed = true;
  if (guild.active.length) throw new AutoBlocked('Unresolved guild objective after earned exploration; no floor completion claimed.');
  if (!state.descent) throw new AutoBlocked('No earned descent waypoint after exploration.');
  state.objective = { kind: 'exit', id: `exit:${state.level}`, roomId: state.descent.cell.spaceId };
  state.reason = 'Known work complete; routing to deliberately selected stairs.';
}

export function observedDescent(cells: RememberedCell[]): WorldPosition | undefined { return cells.find(c => c.stairs.includes('down'))?.at; }
