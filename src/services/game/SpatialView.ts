import type { FloorFrame, StairPlacement } from '../../domain/expedition/vertical';
import type { GridPosition } from '../../domain/types';
import type { ObservedCell } from '../../persistence/canonical/knowledge/types';
import type { CanonicalSnapshot } from '../../persistence/canonical/types';
import type { WorldPosition } from '../../persistence/canonical/world/types';
import type { SpaceFurnishing } from '../../domain/expedition/types';

/** Transient geometry disclosure, never navigation knowledge, actor state, or a world recipe. */
export interface ConnectorSight {
  id: string; upper: WorldPosition; lower: WorldPosition; placement: StairPlacement;
  upperPoint: GridPosition; lowerPoint: GridPosition;
  targetFrame: FloorFrame;
  cells: ObservedCell[]; // v1 fixture compatibility; v2 uses deduplicated structural rooms
  geometryReady?: boolean; travelReady?: boolean;
}
export interface SpatialRoom {
  furnishing?: SpaceFurnishing;
  id: string; level: number; spaceId: string; frame: FloorFrame; kind: 'room' | 'passage'; cells: ObservedCell[];
  voids: { world: GridPosition; floorOpen: boolean; ceilingOpen: boolean }[];
}
export interface SpatialStairPort {
  id: string; at: WorldPosition; world: GridPosition; frame: FloorFrame; end: 'upper' | 'lower';
}
export const MAX_STAIR_ROOMS = 4, MAX_STAIR_ROOM_CELLS = 900;
export interface SpatialView {
  version: 'connector-sight-v1' | 'stair-room-sight-v2'; binding: string; frame: FloorFrame;
  prepareDown: boolean; connector?: ConnectorSight;
  connectors?: ConnectorSight[]; rooms?: SpatialRoom[]; ports?: SpatialStairPort[];
}
export const spatialBinding = (snapshot: CanonicalSnapshot) => JSON.stringify(snapshot);
