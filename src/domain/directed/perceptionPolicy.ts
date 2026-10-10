import { addressKey, sameAddress } from '../expedition/address';
import type { CellAddress } from '../expedition/types';
import { PERCEPTION_POLICY, PERCEPTION_PROFILES } from './perceptionTypes';
import type { InspectionDirection, InspectionEvidence, SuspiciousCue } from './perceptionTypes';
import type { DirectedActor, DirectedWorld, ObservationReceipt, ObservedFeature } from './types';

/** Deliberately small fixture policy. Mechanics and future stat progression remain host-owned. */
export function applyPerceptionPolicy(world: DirectedWorld, actor: DirectedActor, observation: ObservationReceipt,
  inspection?: { direction: InspectionDirection; attemptId: string }) {
  if (!actor.perceptionProfile) return;
  const effectiveValue = PERCEPTION_PROFILES[actor.perceptionProfile];
  observation.policyVersion = PERCEPTION_POLICY;
  observation.perception = { profileId: actor.perceptionProfile, effectiveValue, conditions: 'clear' };
  const { scene } = observation;
  scene.cues = [];
  scene.examinations = [];
  const here = scene.cells.find(cell => sameAddress(cell.address, actor.position));
  const visible = new Set(scene.cells.map(cell => addressKey(cell.address)));
  const near = new Map<string, { position: CellAddress; direction: InspectionDirection }>();
  near.set(addressKey(actor.position), { position: actor.position, direction: 'here' });
  for (const [direction, position] of Object.entries(here?.exits ?? {})) {
    if (visible.has(addressKey(position))) near.set(addressKey(position), { position, direction: direction as InspectionDirection });
  }
  let coverage: InspectionEvidence | undefined;
  if (inspection) {
    const target = [...near.values()].find(entry => entry.direction === inspection.direction);
    coverage = { ...inspection, viewpoint: { ...actor.position }, coveredCells: target ? [{ ...target.position }] : [],
      depth: effectiveValue >= 3 ? 'detail' : 'surface', limitation: target ? 'adjacent-cell-only' : 'no-visible-crossing' };
    scene.inspection = coverage;
  }
  const cues = new Map<InspectionDirection, SuspiciousCue>();
  for (const feature of Object.values(world.features)) {
    if (!feature.hidden) continue;
    const reached = near.get(addressKey(feature.position));
    if (!reached || effectiveValue === 0) continue;
    if (effectiveValue === 1) {
      // Aggregate by public direction, never by hidden identity or object count.
      cues.set(reached.direction, { kind: 'suspicious', direction: reached.direction, message: 'Something seems unusual nearby.' });
      continue;
    }
    const disclosed: ObservedFeature = { id: feature.id, kind: feature.kind,
      name: feature.kind === 'trap' ? 'Floor trap' : feature.name, position: { ...feature.position }, state: feature.state, disclosure: 'detected' };
    scene.features.push(disclosed);
    if (effectiveValue >= 3 && coverage?.coveredCells.some(cell => sameAddress(cell, feature.position))) {
      scene.examinations.push({ featureId: feature.id,
        detail: feature.examinationDetail ?? 'The concealed feature is identified. No additional mechanism is established.' });
    }
  }
  scene.cues = [...cues.values()].sort((a, b) => a.direction.localeCompare(b.direction));
  // An unsuccessful detection is not evidence that a previously found concealed feature disappeared.
  const disclosed = new Set(scene.features.map(feature => feature.id));
  scene.absentFeatureIds = scene.absentFeatureIds.filter(id => !disclosed.has(id));
}
