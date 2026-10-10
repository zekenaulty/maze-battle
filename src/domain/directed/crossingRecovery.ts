import { addressKey, sameAddress } from '../expedition/address';
import type { CellAddress } from '../expedition/types';
import type { CrossingRecovery, KnowledgeProjection, PerceivedScene } from './types';

export const crossingKey = (from: CellAddress, to: CellAddress) => `${addressKey(from)}>${addressKey(to)}`;

export function localBlockedCrossings(knowledge: KnowledgeProjection, from: CellAddress): CellAddress[] {
  return Object.values(knowledge.blockedEdges ?? {}).filter(({ value }) => sameAddress(value.from, from))
    .map(({ value }) => value.to);
}

/** New local evidence permits reconsideration, not a claim that a crossing is safe. */
export function observedCrossingRecovery(knowledge: KnowledgeProjection, scene: PerceivedScene): CrossingRecovery[] {
  const here = scene.cells.find(cell => sameAddress(cell.address, scene.position));
  return localBlockedCrossings(knowledge, scene.position).flatMap(to => {
    if (!scene.cells.some(cell => sameAddress(cell.address, to))
      || !Object.values(here?.exits ?? {}).some(exit => sameAddress(exit, to))) return [];
    const opened = scene.features.find(feature => {
      const previous = knowledge.features[feature.id]?.value;
      return feature.kind === 'door' && feature.state === 'open' && sameAddress(feature.position, to)
        && (!previous || previous.state !== 'open' || !sameAddress(previous.position, to));
    });
    const removed = scene.absentFeatureIds.find(id => {
      const previous = knowledge.features[id]?.value;
      return previous?.kind === 'door' && sameAddress(previous.position, to)
        && !scene.features.some(feature => feature.id === id);
    });
    if (!opened && !removed) return [];
    return [{ from: { ...scene.position }, to: { ...to }, featureId: opened?.id ?? removed!,
      change: opened ? 'opened' as const : 'removed' as const }];
  });
}

export function applyCrossingRecovery(previous: KnowledgeProjection, next: KnowledgeProjection, scene: PerceivedScene) {
  const recovery = scene.crossingRecovery;
  // Older observations keep their original projection semantics during replay.
  if (!recovery) return;
  const expected = observedCrossingRecovery(previous, scene);
  const keys = new Set<string>();
  if (recovery.policyVersion !== 'observed-door-change-v1' || recovery.edges.length !== expected.length
    || recovery.edges.some(edge => {
      const key = crossingKey(edge.from, edge.to);
      if (keys.has(key)) return true;
      keys.add(key);
      return !expected.some(value => sameAddress(value.from, edge.from) && sameAddress(value.to, edge.to)
        && value.featureId === edge.featureId && value.change === edge.change);
    })) throw new Error('Crossing recovery requires new local door evidence.');
  for (const edge of recovery.edges) delete next.blockedEdges?.[crossingKey(edge.from, edge.to)];
}
