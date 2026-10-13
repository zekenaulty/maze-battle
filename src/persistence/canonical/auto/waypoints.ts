import { opposite } from '../../../domain/maze/movement';
import { same } from '../world/records';
import { check } from '../validation';
import type { CanonicalPages } from '../pages';
import type { KnownStep } from '../knowledge/navigation';
import type { ObservedCell } from '../knowledge/types';
import { loadAutoRoom, saveAutoRoom } from './records';
import { AUTO_LIMITS, type AutoRoom, type AutoState } from './types';

export async function currentAutoRoom(pages: Pick<CanonicalPages, 'get' | 'set'>, state: AutoState): Promise<AutoRoom> {
  const spaceId = state.lastPosition.cell.spaceId, existing = await loadAutoRoom(pages, state, spaceId);
  if (existing) return existing;
  check(spaceId === state.rootId, 'Auto lacks an earned parent waypoint; restart its scope');
  const room: AutoRoom = { schema: 1, level: state.level, spaceId, runId: state.runId, depth: 0, parent: null, completed: [], closed: false };
  await saveAutoRoom(pages, room); return room;
}

/** Called only after the shared move committed sight. Never synthesize a reciprocal edge. */
export async function recordAutoCrossing(pages: Pick<CanonicalPages, 'get' | 'set'>, state: AutoState, room: AutoRoom, step: KnownStep, sight: ObservedCell[]) {
  if (step.from.cell.spaceId === step.to.cell.spaceId) return;
  const reverse = opposite(step.direction), observed = sight.find(c => same(c.at, step.to));
  check(observed && same(observed.edges[reverse] ?? null, step.from), 'Auto crossing lacks observed return edge');
  if (room.parent?.to.cell.spaceId === step.to.cell.spaceId) {
    const parent = await loadAutoRoom(pages, state, step.to.cell.spaceId);
    check(parent && parent.depth + 1 === room.depth, 'Auto parent progress is missing');
    if (room.closed && !parent.completed.includes(room.spaceId)) await saveAutoRoom(pages, { ...parent, completed: [...parent.completed, room.spaceId] });
  } else {
    const destination = await loadAutoRoom(pages, state, step.to.cell.spaceId);
    if (destination) check(destination.parent?.to.cell.spaceId === room.spaceId && destination.depth === room.depth + 1, 'Auto encountered a non-tree or unrelated learned exit');
    else await saveAutoRoom(pages, { schema: 1, level: state.level, spaceId: step.to.cell.spaceId, runId: state.runId,
      depth: room.depth + 1, parent: { from: observed.at, to: observed.edges[reverse]!, direction: reverse }, completed: [], closed: false });
  }
}

/** At most eight parent reads per planning tick; the two-cursor search survives reload. */
export async function objectiveHop(pages: Pick<CanonicalPages, 'get'>, state: AutoState, room: AutoRoom): Promise<string | null | 'pending'> {
  const objective = state.objective; if (!objective || objective.roomId === room.spaceId) { state.search = null; return null; }
  let seek = await loadAutoRoom(pages, state, state.search?.objectiveId === objective.id && state.search.fromId === room.spaceId
    ? state.search.seekId : objective.roomId);
  if (!seek) { state.search = null; return null; }
  let childId = state.search?.objectiveId === objective.id && state.search.fromId === room.spaceId ? state.search.childId : null;
  for (let reads = 1; seek.depth > room.depth && reads < AUTO_LIMITS.ancestors; reads++) {
    const previous = seek;
    check(previous.parent, 'Auto ancestor has no parent');
    seek = await loadAutoRoom(pages, state, previous.parent.to.cell.spaceId);
    check(seek && seek.depth + 1 === previous.depth, 'Auto ancestry is not decreasing'); childId = previous.spaceId;
  }
  if (seek.depth > room.depth) {
    state.search = { objectiveId: objective.id, fromId: room.spaceId, seekId: seek.spaceId, childId }; return 'pending';
  }
  state.search = null;
  if (seek.spaceId === room.spaceId) { check(childId, 'Auto descendant waypoint is missing'); return childId; }
  check(room.parent, 'Auto objective belongs to a disconnected learned tree'); return room.parent.to.cell.spaceId;
}
