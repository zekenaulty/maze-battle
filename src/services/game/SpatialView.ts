import type { FloorFrame, StairPlacement } from '../../domain/expedition/vertical';
import type { GridPosition } from '../../domain/types';
import type { ObservedCell } from '../../persistence/canonical/knowledge/types';
import type { CanonicalSnapshot } from '../../persistence/canonical/types';
import type { WorldPosition } from '../../persistence/canonical/world/types';

/** Transient geometry disclosure, never navigation knowledge, actor state, or a world recipe. */
export interface ConnectorSight {
  id: string; upper: WorldPosition; lower: WorldPosition; placement: StairPlacement;
  upperPoint: GridPosition; lowerPoint: GridPosition;
  targetFrame: FloorFrame;
  cells: ObservedCell[]; // bounded radius-one fragment; chests/stairs are deliberately empty
}
export interface SpatialView {
  version: 'connector-sight-v1'; binding: string; frame: FloorFrame;
  prepareDown: boolean; connector?: ConnectorSight;
}
export const spatialBinding = (snapshot: CanonicalSnapshot) => JSON.stringify(snapshot);
