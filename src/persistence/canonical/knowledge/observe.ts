import { asyncLinkedVision } from '../../../domain/maze/linkedVision';
import { movePosition, opposite } from '../../../domain/maze/movement';
import { world } from '../../../domain/expedition/topology/geometry';
import type { Direction } from '../../../domain/types';
import { loadChest, loadRoomContent } from '../content/records';
import { requireWorldContent } from '../content/preparation';
import { loadWorldRoom } from '../world/residency';
import { loadFloor, same, position } from '../world/records';
import type { WorldPosition, WorldRead } from '../world/types';
import { check } from '../validation';
import { cellKey, localKey } from './keys';
import { DIRECTIONS, MAX_VISIBLE_CELLS, VISION_RADIUS, type ObservedCell, type ObservedSpace } from './types';

/** Engine sight only. This bounded resident cache is discarded after the observation. */
export async function observePosition(pages: WorldRead, actor: WorldPosition): Promise<ObservedCell[]> {
  return (await observePositionEvidence(pages, actor)).cells;
}

export async function observePositionEvidence(pages: WorldRead, actor: WorldPosition): Promise<{ cells: ObservedCell[]; spaces: ObservedSpace[] }> {
  position(actor);
  actor = structuredClone(actor);
  await requireWorldContent(pages, actor.level);
  const floor = await loadFloor(pages, actor.level);
  const rooms = new Map<string, Awaited<ReturnType<typeof loadWorldRoom>>>();
  const room = async (id: string) => {
    let value = rooms.get(id);
    if (!value) {
      check(rooms.size < 16, 'visibility residency limit exceeded');
      value = await loadWorldRoom(pages, actor.level, id); rooms.set(id, value);
    }
    return value;
  };
  const exits = new Map<string, Partial<Record<Direction, WorldPosition>>>();
  const neighbors = async (at: WorldPosition) => {
    const r = await room(at.cell.spaceId), c = r.geometry.cells.find(c => c.row === at.cell.row && c.column === at.cell.column);
    check(c, 'observed actor or doorway is outside walkable geometry');
    const edges: Partial<Record<Direction, WorldPosition>> = {};
    for (const d of c.links) edges[d] = { level: at.level, cell: { ...movePosition(at.cell, d), spaceId: at.cell.spaceId } };
    for (const link of r.connections) {
      const forward = link.from.spaceId === at.cell.spaceId, from = forward ? link.from : link.to;
      if (!same(from, at.cell)) continue;
      const d = forward ? link.direction : opposite(link.direction), target = forward ? link.to : link.from;
      check(!edges[d], 'doorway overlaps an internal link');
      edges[d] = { level: at.level, cell: target };
    }
    exits.set(cellKey(at), edges); return Object.values(edges);
  };
  const positions = await asyncLinkedVision(actor, VISION_RADIUS, cellKey, neighbors, MAX_VISIBLE_CELLS);
  const visible = new Set(positions.map(cellKey)), content = new Map<string, Awaited<ReturnType<typeof loadChest>> | null>();
  const result: ObservedCell[] = [], spaces: ObservedSpace[] = [];
  for (const at of positions) {
    const r = await room(at.cell.spaceId);
    if (!spaces.some(s => s.spaceId === at.cell.spaceId))
      spaces.push({ spaceId: at.cell.spaceId, kind: r.space.spec.kind, index: result.length,
        ...(r.space.spec.furnishing !== undefined ? { furnishing: r.space.spec.furnishing } : {}) });
    if (!exits.has(cellKey(at))) await neighbors(at);
    if (!content.has(at.cell.spaceId)) {
      const c = r.space.spec.kind === 'room' ? await loadRoomContent(pages, at.level, at.cell.spaceId) : null;
      content.set(at.cell.spaceId, c?.chestId ? await loadChest(pages, at.level, c.chestId) : null);
    }
    const chest = content.get(at.cell.spaceId)?.chest;
    const observed: ObservedCell = { at: structuredClone(at), world: world(r.space.spec, at.cell), edges: {}, chests: [], stairs: [] };
    for (const d of DIRECTIONS) {
      const next = exits.get(cellKey(at))![d];
      if (!next) observed.edges[d] = null;
      else if (visible.has(cellKey(next))) {
        const other = await room(next.cell.spaceId);
        // A visible cross-room link must be reciprocal and physically adjacent.
        if (!exits.has(cellKey(next))) await neighbors(next);
        check(same(exits.get(cellKey(next))![opposite(d)], at)
          && same(world(other.space.spec, next.cell), movePosition(observed.world, d)), 'invalid visible reciprocal link');
        observed.edges[d] = structuredClone(next);
      }
    }
    if (chest && `${chest.position.row}:${chest.position.column}` === localKey(at)) observed.chests.push({ id: chest.id, opened: chest.opened });
    if (same(floor.entry, at.cell)) observed.stairs.push(at.level === 1 ? 'town' : 'up');
    if (same(floor.exit, at.cell)) observed.stairs.push('down');
    result.push(observed);
  }
  return { cells: result, spaces };
}
