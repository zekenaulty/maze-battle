import { addressKey, sameAddress } from '../expedition/address';
import type { CellAddress } from '../expedition/types';
import type { DirectedActor, DirectedWorld, WorldEvent } from './types';

function hasEdge(world: DirectedWorld, from: CellAddress, to: CellAddress): boolean {
  return Boolean(world.cells[addressKey(to)] && Object.values(world.cells[addressKey(from)]?.exits ?? {})
    .some(destination => sameAddress(destination, to)));
}

export function canTraverseDirected(world: DirectedWorld, from: CellAddress, to: CellAddress): boolean {
  return hasEdge(world, from, to) && !Object.values(world.features).some(feature =>
    feature.kind === 'door' && sameAddress(feature.position, to)
    && (feature.state === 'closed' || feature.state === 'locked'));
}

export function moveDirectedWorld(world: DirectedWorld, actor: DirectedActor, to: CellAddress): {
  world: DirectedWorld; actor: DirectedActor; event: WorldEvent;
} {
  if (!canTraverseDirected(world, actor.position, to)) throw new Error('Illegal directed movement.');
  const next = structuredClone(world);
  next.revision++;
  return {
    world: next,
    actor: { id: actor.id, position: { ...to } },
    event: {
      id: `${world.id}:event:${next.revision}`, revision: next.revision, type: 'move',
      subjectId: actor.id, position: { ...to }, before: addressKey(actor.position), after: addressKey(to),
    },
  };
}

export function interactDirectedWorld(world: DirectedWorld, actor: DirectedActor, featureId: string): {
  world: DirectedWorld; event: WorldEvent;
} {
  const feature = world.features[featureId];
  if (!feature || feature.hidden || !world.cells[addressKey(actor.position)]
    || !world.cells[addressKey(feature.position)]
    || (!sameAddress(actor.position, feature.position) && !hasEdge(world, actor.position, feature.position))) {
    throw new Error('Feature is not available for local interaction.');
  }
  const after = feature.kind === 'lever' && feature.state === 'idle' ? 'active'
    : feature.kind === 'chest' && feature.state === 'closed' ? 'open' : undefined;
  if (!after) throw new Error('Unsupported directed interaction.');
  const next = structuredClone(world);
  next.revision++;
  next.features[featureId].state = after;
  return {
    world: next,
    event: {
      id: `${world.id}:event:${next.revision}`, revision: next.revision, type: 'interact',
      subjectId: feature.id, position: { ...feature.position }, before: feature.state, after,
    },
  };
}
