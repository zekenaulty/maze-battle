import type { MazeRoomState } from '../types';
import type { RoomFootprint } from './structuredRooms';
import { accumulateModuleRole, createModuleRoleAccumulator, finalizeModuleRolePlan, resolveModuleRoomRole } from './moduleRolePlan';

export interface RoomEdge { fromRoomId: string; toRoomId: string }

/** Roles are bounded content assignments, never the identity of a structural module. */
export function assignModuleRoles(footprints: (RoomFootprint & { id: string })[], edges: RoomEdge[], seed: number): MazeRoomState[] {
  if (footprints.length < 3) throw new Error('A floor needs entry, hub and exit rooms');
  const graph = new Map(footprints.map(room => [room.id, [] as string[]]));
  if (graph.size !== footprints.length) throw new Error('Duplicate module identity');
  for (const edge of edges) {
    if (!graph.has(edge.fromRoomId) || !graph.has(edge.toRoomId)) throw new Error('Dangling room edge');
    graph.get(edge.fromRoomId)!.push(edge.toRoomId);
    graph.get(edge.toRoomId)!.push(edge.fromRoomId);
  }
  const entry = footprints[0].id;
  const distances = new Map([[entry, 0]]);
  const queue = [entry];
  for (let index = 0; index < queue.length; index++) {
    for (const id of graph.get(queue[index])!) {
      if (distances.has(id)) continue;
      distances.set(id, distances.get(queue[index])! + 1);
      queue.push(id);
    }
  }
  if (distances.size !== footprints.length) throw new Error('Disconnected room graph');
  const exit = queue.reduce((best, id) => distances.get(id)! > distances.get(best)!
    || (distances.get(id) === distances.get(best) && id < best) ? id : best, entry);
  let accumulator = createModuleRoleAccumulator({ entryId: entry, exitId: exit, seed });
  for (const room of footprints) {
    accumulator = accumulateModuleRole(accumulator, { id: room.id, degree: graph.get(room.id)!.length });
  }
  const plan = finalizeModuleRolePlan(accumulator);
  return footprints.map(room => ({ ...room, center: { ...room.center }, ...resolveModuleRoomRole(plan, room.id) }));
}
