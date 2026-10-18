import type { DestinationLimits } from '../../../domain/directed/destinationLimits';
import type { Direction } from '../../../domain/types';
import type { CanonicalWorkLimits } from '../types';
import type { WorldPosition } from '../world/types';
import type { FrontierSelection } from '../knowledge/frontiers';
import type { CellSource } from '../knowledge/types';
import type { ExplorationMaterialChange } from '../knowledge/explorationPolicy';
import type { KnowledgeRegionScope } from '../knowledge/region';

interface NavigationBinding {
  schema: 1;
  target: WorldPosition;
  limits: DestinationLimits;
}
export type DestinationBinding = NavigationBinding & ({ kind: 'known-destination' }
  | { kind: 'frontier-approach' | 'frontier-exploration'; frontier: FrontierSelection });
export interface RouteStep { direction: Direction; to: WorldPosition }
export type DestinationReason = 'arrived' | 'time-limit' | 'step-limit' | 'replan-limit' | 'unknown-destination'
  | 'route-unavailable' | 'scope-limit' | 'unavailable' | 'obstructed'
  | 'new-object' | 'changed-evidence' | 'scope-boundary' | 'scope-exhausted';
export interface ExplorationCursor {
  phase: 'approach' | 'cross-frontier' | 'survey';
  target: WorldPosition;
  window: KnowledgeRegionScope;
}
export interface ExplorationNotice {
  kind: ExplorationMaterialChange['reason'];
  at: WorldPosition;
  source: CellSource;
  previousSource: CellSource | null;
}
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
  status: 'running' | 'arrived' | 'blocked' | 'decision';
  reason: DestinationReason | null;
  exploration?: ExplorationCursor;
  notice?: ExplorationNotice;
}
export const destinationDisposition = (p: DestinationProgress) => p.status === 'arrived' || p.status === 'decision'
  ? 'completed' as const : p.status === 'blocked' ? 'blocked' as const : null;
// Policy-unlimited never removes these per-call bounds or the kernel quota.
export const RETAINED_ROUTE_STEPS = 16;
export const NAVIGATION_WORK_LIMITS: Readonly<CanonicalWorkLimits> = { reads: 16384, writes: 512, bytes: 16 * 1024 * 1024 };
