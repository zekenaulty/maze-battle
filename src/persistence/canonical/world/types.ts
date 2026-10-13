import type { CellAddress, SpaceSpec } from '../../../domain/expedition/types';
import type { ModuleStepState } from '../../../domain/expedition/topology/modules/step';
import type { CanonicalPages } from '../pages';
import type { JsonObject } from '../types';

export type WorldRead = Pick<CanonicalPages, 'get' | 'scan'> & Partial<Pick<CanonicalPages, 'witness'>>;
export interface WorldHeader { schema: 1; worldId: string; deepestLevel: number }
export interface WorldFloor {
  schema: 1;
  level: number;
  generation: ModuleStepState;
  nextPending: number;
  entry: CellAddress;
  farthest: { spaceId: string; distance: number };
  exit: CellAddress | null;
}
export interface WorldSpace { schema: 1; level: number; schematic: 'stone-room-v1'; spec: SpaceSpec; distance: number }
export interface SpacePorts { schema: 1; level: number; spaceId: string; connections: string[]; pending: string[] }
export interface WorldPosition { level: number; cell: CellAddress }
export interface WorldStairs { schema: 1; upper: WorldPosition; lower: WorldPosition }
export interface WorldMutation {
  schema: 1; level: number; spaceId: string; entityId: string;
  kind: 'chest' | 'mechanism' | 'hazard' | 'encounter'; state: JsonObject;
}
