import type { DestinationLimits } from '../../../domain/directed/destinationLimits';
import type { Direction } from '../../../domain/types';
import type { CanonicalWorkLimits } from '../types';
import type { WorldPosition } from '../world/types';

export interface DestinationBinding {
  schema: 1;
  kind: 'known-destination';
  target: WorldPosition;
  limits: DestinationLimits;
}
export interface RouteStep { direction: Direction; to: WorldPosition }
export type DestinationReason = 'arrived' | 'time-limit' | 'step-limit' | 'replan-limit' | 'unknown-destination'
  | 'route-unavailable' | 'scope-limit' | 'unavailable' | 'obstructed';
export interface DestinationProgress {
  schema: 1;
  operationId: string;
  binding: DestinationBinding;
  sourceAttemptId: string;
  owner: string;
  epoch: number;
  sequence: number;
  steps: number;
  replans: number;
  startedAt: number;
  deadline: number | null;
  position: WorldPosition;
  route: RouteStep[];
  status: 'running' | 'arrived' | 'blocked';
  reason: DestinationReason | null;
}
// Policy-unlimited never removes these per-call bounds or the kernel quota.
export const RETAINED_ROUTE_STEPS = 16;
export const NAVIGATION_WORK_LIMITS: Readonly<CanonicalWorkLimits> = { reads: 16384, writes: 512, bytes: 16 * 1024 * 1024 };
