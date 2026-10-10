import { addressKey, sameAddress } from '../expedition/address';
import { PERCEPTION_POLICY, PERCEPTION_PROFILES } from './perceptionTypes';
import type { ObservationReceipt } from './types';

/** Validate source-local disclosure lineage without re-running perception against current truth. */
export function assertPerceptionEvidence(observation: ObservationReceipt) {
  const { scene, perception } = observation;
  const fail = () => { throw new Error('Inconsistent perception evidence.'); };
  if (observation.policyVersion !== PERCEPTION_POLICY) {
    if (perception || scene.cues || scene.examinations || scene.inspection
      || scene.features.some(feature => feature.disclosure)) fail();
    return;
  }
  if (!perception || PERCEPTION_PROFILES[perception.profileId] !== perception.effectiveValue
    || perception.conditions !== 'clear' || !scene.cues || !scene.examinations) return fail();
  const here = scene.cells.find(cell => sameAddress(cell.address, scene.position));
  const visible = new Set(scene.cells.map(cell => addressKey(cell.address)));
  const nearby = new Set([addressKey(scene.position), ...Object.values(here?.exits ?? {})
    .filter(to => visible.has(addressKey(to))).map(addressKey)]);
  const inspection = scene.inspection;
  if ((observation.reason === 'inspection') !== Boolean(inspection)) fail();
  if (inspection) {
    const target = inspection.direction === 'here' ? scene.position : here?.exits[inspection.direction];
    const expected = target && visible.has(addressKey(target)) ? [target] : [];
    if (!sameAddress(inspection.viewpoint, scene.position)
      || inspection.coveredCells.length !== expected.length
      || expected.some((cell, index) => !sameAddress(cell, inspection.coveredCells[index]))
      || inspection.depth !== (perception.effectiveValue >= 3 ? 'detail' : 'surface')
      || inspection.limitation !== (expected.length ? 'adjacent-cell-only' : 'no-visible-crossing')) fail();
  }
  if (scene.cues.length && perception.effectiveValue !== 1) fail();
  if (new Set(scene.cues.map(cue => cue.direction)).size !== scene.cues.length) fail();
  for (const cue of scene.cues) {
    const target = cue.direction === 'here' ? scene.position : here?.exits[cue.direction];
    if (!target || !nearby.has(addressKey(target))) fail();
  }
  for (const feature of scene.features) {
    if (feature.disclosure && (perception.effectiveValue < 2 || !nearby.has(addressKey(feature.position)))) fail();
  }
  if (new Set(scene.examinations.map(item => item.featureId)).size !== scene.examinations.length) fail();
  for (const examination of scene.examinations) {
    const feature = scene.features.find(item => item.id === examination.featureId);
    if (!feature || !inspection || perception.effectiveValue < 3
      || !inspection.coveredCells.some(cell => sameAddress(cell, feature.position))) fail();
  }
}
