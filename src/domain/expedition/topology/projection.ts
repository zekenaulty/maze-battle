import { opposite } from '../../maze/movement';
import { materializeSpace } from '../schematic';
import type { SpaceSpec } from '../types';
import type { TopologyConnection, TopologySpace } from './types';

export function materializeTopologySpace(space: TopologySpace) {
  if (space.schematic !== 'stone-room-v1') throw new Error('Unsupported schematic version');
  return materializeSpace(space.spec);
}

/** Runtime/renderer projection only. Observations still pass through visibility. */
export function resolvedSpaceSpec(space: TopologySpace, connections: TopologyConnection[]): SpaceSpec {
  const spec = structuredClone(space.spec);
  for (const link of connections) {
    const forward = link.from.spaceId === spec.id;
    if (!forward && link.to.spaceId !== spec.id) throw new Error('Connection does not belong to space');
    const source = forward ? link.from : link.to;
    spec.openings.push({ id: `${link.id}:${forward ? 'from' : 'to'}`, cell: { row: source.row, column: source.column },
      direction: forward ? link.direction : opposite(link.direction), destination: { ...(forward ? link.to : link.from) } });
  }
  return spec;
}
