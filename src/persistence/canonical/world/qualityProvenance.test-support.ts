import { connection } from '../../../domain/expedition/topology/geometry';
import type { ModuleAssemblyState } from '../../../domain/expedition/topology/modules/types';
import { chainRecords } from './qualityChain.test-support';
import { qualityMemory } from './quality.test-support';
import type { WorldFloor } from './types';

/** Wegener's two-arm entry repro: node 2 is not the final cursor witness. */
export function twoArmChain() {
  const source = chainRecords(13), assembly: ModuleAssemblyState = source.assembly(), m = qualityMemory();
  assembly.spaces = assembly.spaces.map((space, ordinal) => ({ ...space,
    origin: { row: 0, column: ordinal === 0 ? 0 : ordinal === 1 ? -5 : (ordinal - 1) * 5 } }));
  assembly.joins[0].direction = 'west';
  assembly.joins[1].fromRoomId = 'entry';
  assembly.connections = assembly.joins.map(join => connection(`${join.id}:door`,
    assembly.spaces.find(space => space.id === join.fromRoomId)!,
    assembly.spaces.find(space => space.id === join.toRoomId)!, join.direction));
  const floor = structuredClone(source.read('dungeon/1')) as WorldFloor;
  floor.farthest.distance--;
  m.put('dungeon', source.read('dungeon')); m.put('dungeon/1', floor);
  for (const [ordinal, spec] of assembly.spaces.entries()) {
    m.put(`dungeon/1/space/${spec.id}`, { schema: 1, level: 1, schematic: 'stone-room-v1', spec,
      distance: ordinal <= 1 ? ordinal : ordinal - 1 });
    m.put(`dungeon/1/ports/${spec.id}`, { schema: 1, level: 1, spaceId: spec.id, pending: [],
      connections: assembly.connections.filter(c => c.from.spaceId === spec.id || c.to.spaceId === spec.id).map(c => c.id) });
  }
  for (const join of assembly.joins) m.put(`dungeon/1/join/${join.id}`, { schema: 1, level: 1, join });
  for (const link of assembly.connections) m.put(`dungeon/1/connection/${link.id}`, { schema: 1, level: 1, connection: link });
  return { ...m, assembly };
}
