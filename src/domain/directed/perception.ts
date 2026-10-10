import { addressKey, sameAddress } from '../expedition/address';
import type { Direction } from '../types';
import type { CellAddress } from '../expedition/types';
import { observedCrossingRecovery } from './crossingRecovery';
import { applyPerceptionPolicy } from './perceptionPolicy';
import type { InspectionDirection } from './perceptionTypes';
import type {
  DirectedActor, DirectedCell, DirectedWorld, KnowledgeProjection, ObservationReceipt, ObservedFeature,
} from './types';

const radius = 2;
const directions: Direction[] = ['north', 'east', 'south', 'west'];
const address = ({ spaceId, row, column }: CellAddress): CellAddress => ({ spaceId, row, column });

export function observeDirected(
  world: DirectedWorld, actor: DirectedActor, knowledge: KnowledgeProjection, reason: ObservationReceipt['reason'],
  inspection?: { direction: InspectionDirection; attemptId: string },
): ObservationReceipt {
  if (world.id !== knowledge.worldId || actor.id !== knowledge.observerId) {
    throw new Error('Observation world/observer mismatch.');
  }
  if (!Number.isSafeInteger(knowledge.revision) || knowledge.revision < 0
    || !Number.isSafeInteger(knowledge.revision + 1)) throw new Error('Invalid knowledge revision.');
  if (!world.cells[addressKey(actor.position)]) throw new Error('Observer cell is unavailable.');

  const queue = [{ position: actor.position, distance: 0 }];
  const seen = new Set([addressKey(actor.position)]);
  const features: ObservedFeature[] = [];
  const blocked = new Set<string>();
  for (const current of queue) {
    const key = addressKey(current.position);
    // Only inspect features at cells actually reached by the observation frontier.
    for (const feature of Object.values(world.features)) {
      if (feature.hidden || !sameAddress(feature.position, current.position)) continue;
      const { id, kind, name, position, state } = feature;
      features.push({ id, kind, name, position: address(position), state });
      if (kind === 'door' && (state === 'closed' || state === 'locked')) blocked.add(key);
    }
    if (current.distance === radius || (current.distance > 0 && blocked.has(key))) continue;
    for (const direction of directions) {
      const destination = world.cells[key].exits[direction];
      if (!destination || !world.cells[addressKey(destination)] || seen.has(addressKey(destination))) continue;
      seen.add(addressKey(destination));
      queue.push({ position: destination, distance: current.distance + 1 });
    }
  }

  const cells = queue.map(({ position }): DirectedCell => {
    const exits: DirectedCell['exits'] = {};
    for (const direction of directions) {
      const destination = world.cells[addressKey(position)].exits[direction];
      // An incident edge may reach outside coverage; never query that destination's truth here.
      if (destination && !blocked.has(addressKey(destination))) exits[direction] = address(destination);
    }
    return { address: address(position), exits };
  });
  const spaces = [...new Set(cells.map(cell => cell.address.spaceId))].map(id => {
    const { name, originX, originZ, rows, columns } = world.spaces[id];
    return { id, name, originX, originZ, rows, columns };
  });
  const absentFeatureIds = Object.values(knowledge.features)
    .filter(({ value }) => !value.disclosure && seen.has(addressKey(value.position)) && !features.some(feature => feature.id === value.id))
    .map(({ value }) => value.id).sort();
  const sequence = knowledge.revision + 1;
  const observation: ObservationReceipt = {
    id: `${world.id}:${actor.id}:observation:${sequence}`, worldId: world.id, observerId: actor.id,
    sequence, sourceWorldRevision: world.revision, policyVersion: 'fixture-visibility-v1', reason,
    coverage: { radius, basis: 'connected-cells', complete: true },
    scene: { position: address(actor.position), cells, spaces, features, absentFeatureIds },
  };
  applyPerceptionPolicy(world, actor, observation, inspection);
  const edges = observedCrossingRecovery(knowledge, observation.scene);
  if (edges.length) observation.scene.crossingRecovery = { policyVersion: 'observed-door-change-v1', edges };
  return observation;
}
