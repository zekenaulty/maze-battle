import type { CellAddress, SpaceSpec } from '../../../domain/expedition/types';
import type { FloorFrame, StairPlacement, StairRoomLayout, STAIR_LAYOUT_VERSION } from '../../../domain/expedition/vertical';
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
  spatial?: { version: typeof STAIR_LAYOUT_VERSION; frame: FloorFrame };
}
export interface WorldSpace { schema: 1; level: number; schematic: 'stone-room-v1' | 'open-room-v1' | 'stair-room-v1'; spec: SpaceSpec; distance: number; stairwell?: StairRoomLayout }
export interface SpacePorts { schema: 1; level: number; spaceId: string; connections: string[]; pending: string[] }
export interface WorldPosition { level: number; cell: CellAddress }
export interface WorldStairs { schema: 1; upper: WorldPosition; lower: WorldPosition; placement?: StairPlacement }
export interface WorldMutation {
  schema: 1; level: number; spaceId: string; entityId: string;
  kind: 'chest' | 'mechanism' | 'hazard' | 'encounter'; state: JsonObject;
}
