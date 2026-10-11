import type { MazeRoomKind, MazeRoomState } from '../types';
import type { RoomFootprint } from './structuredRooms';
import { roomTagsForKind } from './structuredRooms';
import { keyedSeed } from '../expedition/topology/seed';

export interface RoomEdge { fromRoomId: string; toRoomId: string }
const SPECIALTIES: MazeRoomKind[] = ['treasure', 'boss', 'safe', 'treasure', 'safe'];
const NAMES: Record<MazeRoomKind, string> = {
  start: 'Entry Hall', exit: 'Descent Gate', hub: 'Central Hub', ordinary: 'Chamber',
  treasure: 'Vault', boss: 'Guard Post', safe: 'Sanctuary',
};

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
  const candidates = footprints.filter(room => room.id !== entry && room.id !== exit);
  const hub = candidates.reduce((best, room) => graph.get(room.id)!.length > graph.get(best.id)!.length
    || (graph.get(room.id)!.length === graph.get(best.id)!.length && room.id < best.id) ? room : best).id;
  const roles = new Map<string, MazeRoomKind>([[entry, 'start'], [exit, 'exit'], [hub, 'hub']]);
  candidates.filter(room => room.id !== hub)
    .sort((a, b) => keyedSeed(seed, `${a.id}:role`) - keyedSeed(seed, `${b.id}:role`) || a.id.localeCompare(b.id))
    .slice(0, SPECIALTIES.length).forEach((room, index) => roles.set(room.id, SPECIALTIES[index]));
  return footprints.map(room => {
    const kind = roles.get(room.id) ?? 'ordinary';
    return { ...room, center: { ...room.center }, kind, name: NAMES[kind], tags: roomTagsForKind(kind) };
  });
}
