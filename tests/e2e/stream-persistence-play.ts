import { movePosition } from '../../src/domain/maze/movement';
import type { Direction, GridPosition } from '../../src/domain/types';
import type { StreamCommand } from '../../src/domain/expedition/streaming/types';

/** Test-only local geometry oracle. This qualifies persistence, not an exploration planner. */
export async function playSmallFloor(slot = 'stream') {
  const { api, materializeTopologySpace, resolvedSpaceSpec, trace } = window.stream;
  let snapshot = await api.loadStreamSnapshot(slot);
  const control = (await api.loadStreamControl(slot))!;
  let sequence = snapshot.checkpoint.revision, commands = 0, maximumReads = 0;
  const firstSpecs = new Map<string, string>();
  const perform = async (command: StreamCommand) => {
    const request = { version: 2 as const, actionId: `play-${sequence++}`, ...control,
      expectedRevision: snapshot.checkpoint.revision, expectedTopologyRevision: snapshot.checkpoint.topologyRevision, command };
    const measured = await trace(() => api.executeStreamAction(slot, request));
    if (measured.result.disposition !== 'applied') throw new Error(JSON.stringify({ request, result: measured.result }));
    if (measured.total > (command.type === 'prepare' ? 43 : 16)) throw new Error('Unbounded command reads');
    maximumReads = Math.max(maximumReads, measured.total); commands++;
    snapshot = await api.loadStreamSnapshot(slot);
    const spec = JSON.stringify(snapshot.room.space);
    const id = snapshot.room.space.spec.id;
    if (firstSpecs.has(id) && firstSpecs.get(id) !== spec) throw new Error('Space/chest recipe changed');
    firstSpecs.set(id, spec);
  };
  const walk = async (target: GridPosition) => {
    const key = (cell: GridPosition) => `${cell.row},${cell.column}`;
    const geometry = materializeTopologySpace(snapshot.room.space);
    const cells = new Map(geometry.cells.map(cell => [key(cell), cell]));
    const queue = [{ at: snapshot.checkpoint.position, path: [] as Direction[] }];
    const seen = new Set([key(queue[0].at)]);
    for (let index = 0; index < queue.length; index++) {
      const { at, path } = queue[index];
      if (key(at) === key(target)) { for (const direction of path) await perform({ type: 'move', direction }); return; }
      for (const direction of cells.get(key(at))!.links) {
        const next = { ...at, ...movePosition(at, direction) };
        if (!seen.has(key(next))) { seen.add(key(next)); queue.push({ at: next, path: [...path, direction] }); }
      }
    }
    throw new Error('No local route');
  };
  const explore = async (): Promise<void> => {
    const id = snapshot.room.space.spec.id;
    for (const cell of materializeTopologySpace(snapshot.room.space).cells) await walk(cell);
    for (const chest of snapshot.room.space.spec.chests) {
      await walk(chest.cell);
      if (!snapshot.room.knowledge!.chests[chest.id]?.opened) await perform({ type: 'collect' });
    }
    for (const socket of snapshot.room.sockets) {
      await walk(socket.source);
      while (snapshot.room.sockets.find(value => value.id === socket.id)?.status === 'pending') await perform({ type: 'prepare', frontierId: socket.id });
    }
    const exits = resolvedSpaceSpec(snapshot.room.space, snapshot.room.connections).openings;
    for (const port of exits) {
      if (port.id === snapshot.room.knowledge!.parentOpeningId || snapshot.room.knowledge!.completedExits.includes(port.id)) continue;
      await walk(port.cell); await perform({ type: 'move', direction: port.direction });
      await explore();
      if (snapshot.room.space.spec.id !== id) throw new Error('Did not return to parent');
    }
    const parent = snapshot.room.knowledge!.parentOpeningId;
    if (parent) {
      const port = resolvedSpaceSpec(snapshot.room.space, snapshot.room.connections).openings.find(value => value.id === parent)!;
      await walk(port.cell);
      if (!snapshot.room.knowledge!.cleared) throw new Error(`Room did not clear: ${id}`);
      await perform({ type: 'move', direction: port.direction });
    }
  };
  await explore(); await walk(snapshot.checkpoint.home); await perform({ type: 'finish' });
  return { snapshot, commands, maximumReads, spaces: firstSpecs.size };
}
