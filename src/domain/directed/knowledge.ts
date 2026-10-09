import { addressKey } from '../expedition/address';
import type { KnowledgeProjection, ObservationReceipt, Remembered } from './types';

export function emptyDirectedKnowledge(worldId: string, observerId: string): KnowledgeProjection {
  return { worldId, observerId, revision: 0, cells: {}, spaces: {}, features: {}, absent: {} };
}

export function rememberDirected(knowledge: KnowledgeProjection, observation: ObservationReceipt): KnowledgeProjection {
  if (knowledge.worldId !== observation.worldId || knowledge.observerId !== observation.observerId) {
    throw new Error('Observation world/observer mismatch.');
  }
  if (!Number.isSafeInteger(knowledge.revision) || knowledge.revision < 0
    || !Number.isSafeInteger(observation.sequence) || observation.sequence !== knowledge.revision + 1) {
    throw new Error('Observation sequence must immediately follow knowledge revision.');
  }
  const next = structuredClone(knowledge);
  const remember = <T>(value: T): Remembered<T> => ({
    value: structuredClone(value), observationId: observation.id, observedAt: observation.sequence,
  });
  for (const cell of observation.scene.cells) next.cells[addressKey(cell.address)] = remember(cell);
  for (const space of observation.scene.spaces) next.spaces[space.id] = remember(space);
  for (const feature of observation.scene.features) {
    next.features[feature.id] = remember(feature);
    delete next.absent[feature.id];
  }
  const observedCells = new Set(observation.scene.cells.map(cell => addressKey(cell.address)));
  for (const id of observation.scene.absentFeatureIds) {
    const previous = knowledge.features[id];
    if (!previous || !observedCells.has(addressKey(previous.value.position))
      || observation.scene.features.some(feature => feature.id === id)) {
      throw new Error('Absent feature requires observed coverage of its remembered cell.');
    }
    delete next.features[id];
    next.absent[id] = { observationId: observation.id, observedAt: observation.sequence };
  }
  next.revision = observation.sequence;
  return next;
}
