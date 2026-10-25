import { cellKey } from '../../../domain/maze/key';
import { movePosition, opposite } from '../../../domain/maze/movement';
import { check } from '../validation';
import { loadFloor, position, same } from '../world/records';
import { loadWorldRoom } from '../world/residency';
import type { WorldPosition, WorldRead } from '../world/types';

/** Engine-only policy: reachable current-space cells, not legacy floor-wide teleport. */
export async function teleportDestinations(pages: WorldRead, origin: WorldPosition): Promise<WorldPosition[]> {
  position(origin); origin = structuredClone(origin);
  const floor = await loadFloor(pages, origin.level);
  const { geometry } = await loadWorldRoom(pages, origin.level, origin.cell.spaceId);
  check(geometry.cells.length <= 512, 'teleport residency exceeds its bound');
  const cells = new Map(geometry.cells.map(cell => [cellKey(cell), cell]));
  const start = cells.get(cellKey(origin.cell)); check(start, 'teleport origin is not walkable');
  const queue = [start], visited = new Set([cellKey(start)]);
  for (let i = 0; i < queue.length; i++) for (const direction of queue[i].links) {
    const next = cells.get(cellKey(movePosition(queue[i], direction)));
    check(next && next.links.includes(opposite(direction)), 'teleport path is not reciprocal');
    if (!visited.has(cellKey(next))) { visited.add(cellKey(next)); queue.push(next); }
  }
  // Preserve schematic order for stable random selection; never follow a room port.
  return geometry.cells.filter(cell => visited.has(cellKey(cell)) && cell.links.length > 0)
    .map(cell => ({ level: origin.level, cell: { spaceId: origin.cell.spaceId, row: cell.row, column: cell.column } }))
    .filter(at => !same(at, origin) && !same(at.cell, floor.entry) && !same(at.cell, floor.exit));
}
