import { addressKey, sameAddress } from '../expedition/address';
import { applyCrossingRecovery } from './crossingRecovery';
import { assertPerceptionEvidence } from './perceptionEvidence';
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
  assertPerceptionEvidence(observation);
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
    if (!previous || previous.value.disclosure || !observedCells.has(addressKey(previous.value.position))
      || observation.scene.features.some(feature => feature.id === id)) {
      throw new Error('Absent feature requires observed coverage of its remembered cell.');
    }
    delete next.features[id];
    next.absent[id] = { observationId: observation.id, observedAt: observation.sequence };
  }
  if (observation.scene.cues) next.cues = remember(observation.scene.cues);
  if (observation.perception) next.perception = remember(observation.perception);
  if (observation.scene.inspection) next.inspection = remember(observation.scene.inspection);
  for (const examination of observation.scene.examinations ?? []) {
    if (!observation.scene.features.some(feature => feature.id === examination.featureId)
      || !observation.scene.inspection || observation.perception?.effectiveValue !== 3) {
      throw new Error('Examination requires deliberate local inspection and permitted detection.');
    }
    next.examinations ??= {};
    next.examinations[examination.featureId] = remember(examination);
  }
  applyCrossingRecovery(knowledge, next, observation.scene);
  const traversal = observation.scene.traversal;
  if (traversal) {
    const { from, to, passable } = traversal;
    if (!observedCells.has(addressKey(passable ? to : from))
      || !sameAddress(observation.scene.position, passable ? to : from)) throw new Error('Traversal evidence requires local coverage.');
    next.blockedEdges ??= {};
    const key = `${addressKey(from)}>${addressKey(to)}`;
    if (passable) delete next.blockedEdges[key];
    else next.blockedEdges[key] = remember({ from, to });
  }
  next.revision = observation.sequence;
  return next;
}
