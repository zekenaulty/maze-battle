import { destinationDeadline, exceedsLimit, snapshotDestinationLimits, type DestinationLimits } from '../../../domain/directed/destinationLimits';
import { fields } from '../roster/codec';
import { check, integer, jsonBytes, validId } from '../validation';
import { DIRECTIONS } from '../knowledge/types';
import { position, same } from '../world/records';
import { frontierSelection, type FrontierSelection } from '../knowledge/frontiers';
import type { WorldPosition } from '../world/types';
import { RETAINED_ROUTE_STEPS, type DestinationBinding, type DestinationProgress } from './types';

export function destinationPosition(value: unknown): asserts value is WorldPosition {
  const at = fields(value, 'level cell'); fields(at.cell, 'spaceId row column'); position(value as WorldPosition);
}
export function destinationBinding(value: unknown): DestinationBinding {
  const row = fields(value, 'schema kind target limits', 'frontier');
  check(row.schema === 1 && ['known-destination', 'frontier-approach'].includes(row.kind as string), 'invalid navigation binding');
  destinationPosition(row.target); check(row.limits !== undefined, 'missing navigation limits'); snapshotDestinationLimits(row.limits);
  if (row.kind === 'frontier-approach') {
    const selection = frontierSelection(row.frontier);
    check(same(selection.at, row.target), 'frontier target differs from selected anchor');
  } else check(!Object.hasOwn(row, 'frontier'), 'known destination cannot carry exploration authority');
  return structuredClone(value) as DestinationBinding;
}
/** Host supplies a known cell, never a route or hidden objective. Limits are frozen at admission. */
export function createDestinationBinding(target: WorldPosition, limits?: DestinationLimits) {
  return destinationBinding({ schema: 1, kind: 'known-destination', target, limits: snapshotDestinationLimits(limits) });
}
/** Explicit approach permission only. The original source/direction never becomes a dynamic target. */
export function createFrontierBinding(input: FrontierSelection, limits?: DestinationLimits) {
  const selection = frontierSelection(input);
  return destinationBinding({ schema: 1, kind: 'frontier-approach', target: selection.at,
    limits: snapshotDestinationLimits(limits), frontier: selection });
}
export function destinationProgress(value: unknown): DestinationProgress {
  jsonBytes(value, 12 * 1024);
  const p = fields(value, 'schema operationId binding sourceAttemptId owner epoch sequence steps replans startedAt deadline position route status reason');
  check(p.schema === 1 && validId(p.operationId) && validId(p.sourceAttemptId) && validId(p.owner)
    && integer(p.epoch, 1) && integer(p.sequence) && integer(p.steps) && integer(p.replans)
    && p.steps <= p.sequence && p.replans <= p.sequence, 'invalid navigation progress');
  const binding = destinationBinding(p.binding), limits = binding.limits;
  check(p.deadline === destinationDeadline(p.startedAt as number, limits) && !exceedsLimit(p.steps, limits.steps)
    && !exceedsLimit(p.replans, limits.replans), 'invalid navigation limits');
  destinationPosition(p.position);
  check(Array.isArray(p.route) && p.route.length <= RETAINED_ROUTE_STEPS && !exceedsLimit(p.steps + p.route.length, limits.steps), 'unbounded navigation route');
  for (const step of p.route) {
    const s = fields(step, 'direction to'); destinationPosition(s.to);
    check(DIRECTIONS.includes(s.direction as never) && s.to.level === binding.target.level, 'invalid navigation step');
  }
  check(['running', 'arrived', 'blocked'].includes(p.status as string), 'invalid destination status');
  const reasons = ['time-limit', 'step-limit', 'replan-limit', 'unknown-destination', 'route-unavailable', 'scope-limit', 'unavailable', 'obstructed'];
  check(p.status === 'running' ? p.reason === null && p.position.level === binding.target.level
    : p.route.length === 0 && (p.status === 'arrived' ? p.reason === 'arrived' && same(p.position, binding.target) : reasons.includes(p.reason as string)),
  'invalid destination terminal');
  return structuredClone(value) as DestinationProgress;
}
