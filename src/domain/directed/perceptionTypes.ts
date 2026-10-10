import type { CellAddress } from '../expedition/types';
import type { Direction } from '../types';

export const PERCEPTION_POLICY = 'fixture-perception-v1' as const;
export const PERCEPTION_PROFILES = { untrained: 0, alert: 1, keen: 2, expert: 3 } as const;
export type PerceptionProfileId = keyof typeof PERCEPTION_PROFILES;
export type InspectionDirection = Direction | 'here';
export interface SuspiciousCue {
  kind: 'suspicious'; direction: InspectionDirection; message: 'Something seems unusual nearby.';
}
export interface ExaminedFeature {
  featureId: string; detail: string;
}
export interface PerceptionProvenance {
  profileId: PerceptionProfileId; effectiveValue: number; conditions: 'clear';
}
export interface InspectionEvidence {
  attemptId: string; direction: InspectionDirection; viewpoint: CellAddress;
  coveredCells: CellAddress[]; depth: 'surface' | 'detail';
  limitation: 'adjacent-cell-only' | 'no-visible-crossing';
}

export function isPerceptionProfile(value: unknown): value is PerceptionProfileId {
  return typeof value === 'string' && Object.hasOwn(PERCEPTION_PROFILES, value);
}
