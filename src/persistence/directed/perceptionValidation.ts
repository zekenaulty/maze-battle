import { isPerceptionProfile, PERCEPTION_PROFILES } from '../../domain/directed/perceptionTypes';
import { address } from './requestValidation';
import { check, id, integer, keys, list, object, text } from './values';

export function perception(value: unknown) {
  object(value); keys(value, ['profileId', 'effectiveValue', 'conditions']);
  check(isPerceptionProfile(value.profileId), 'unsupported perception profile');
  check(value.effectiveValue === PERCEPTION_PROFILES[value.profileId], 'inconsistent perception profile');
  check(value.conditions === 'clear', 'unsupported perception conditions');
}
export function cues(value: unknown) {
  list(value, 5);
  for (const cue of value) {
    object(cue); keys(cue, ['kind', 'direction', 'message']);
    check(cue.kind === 'suspicious' && cue.message === 'Something seems unusual nearby.', 'invalid suspicious cue');
    inspectionDirection(cue.direction);
  }
}
export function inspectionDirection(value: unknown) {
  check(['here', 'north', 'east', 'south', 'west'].includes(value as string), 'invalid inspection direction');
}
export function inspection(value: unknown) {
  object(value); keys(value, ['attemptId', 'direction', 'viewpoint', 'coveredCells', 'depth', 'limitation']);
  id(value.attemptId); inspectionDirection(value.direction); address(value.viewpoint);
  list(value.coveredCells, 1); value.coveredCells.forEach(address);
  check(value.depth === 'surface' || value.depth === 'detail', 'invalid inspection depth');
  check(['adjacent-cell-only', 'no-visible-crossing'].includes(value.limitation as string), 'invalid inspection coverage');
}
export function examination(value: unknown) {
  object(value); keys(value, ['featureId', 'detail']); id(value.featureId); text(value.detail);
}
export function remembered(value: unknown, revision: number, validate: (value: unknown) => void) {
  object(value); keys(value, ['value', 'observationId', 'observedAt']);
  id(value.observationId); integer(value.observedAt);
  check(value.observedAt > 0 && value.observedAt <= revision, 'invalid perception evidence sequence');
  validate(value.value);
}
