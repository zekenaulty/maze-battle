import type { Direction, GridPosition } from '../../../domain/types';
import type { CanonicalPages } from '../pages';
import type { WorldPosition } from '../world/types';

export type KnowledgeRead = Pick<CanonicalPages, 'get' | 'scan' | 'witness'>;
export interface ObservationRef { sequence: number; id: string }
export interface KnowledgeAnchor extends ObservationRef { witness: string }
export interface CellSource extends ObservationRef { index: number }
export interface ObservedSpace { spaceId: string; kind: 'room' | 'passage'; index: number }
export interface ObservedCell {
  at: WorldPosition;
  world: GridPosition;
  // Missing directions are outside observation coverage, not known walls.
  edges: Partial<Record<Direction, WorldPosition | null>>;
  chests: { id: string; opened: boolean }[];
  stairs: ('town' | 'up' | 'down')[];
}
export interface ObservationHeader {
  schema: 1;
  sequence: number;
  previous: ObservationRef | null;
  owner: string;
  epoch: number;
  revision: number;
  observedAt: string;
  actor: WorldPosition;
  policy: 'linked-vision-v1';
  radius: number;
  count: number;
  chunks: string[];
  chunksDigest: string;
  spaces?: ObservedSpace[];
  graph?: 'available';
}
export interface ObservationChunk { schema: 1; sequence: number; offset: number; cells: ObservedCell[] }
export interface RememberedCell extends Omit<ObservedCell, 'edges'> {
  source: CellSource;
  edges: Partial<Record<Direction, { target: WorldPosition | null; source: CellSource }>>;
}
export interface MemoryBlock {
  schema: 1; level: number; spaceId: string; row: number; column: number;
  cells: Record<string, RememberedCell>;
}
export interface KnownRoom { schema: 1; level: number; spaceId: string; source: CellSource }
export const VISION_RADIUS = 7;
export const MAX_VISIBLE_CELLS = 113; // Manhattan ball at radius seven in the physical cell grid.
export const OBSERVATION_CHUNK_SIZE = 16;
export const MEMORY_BLOCK_SIDE = 4;
export const DIRECTIONS: readonly Direction[] = ['north', 'east', 'south', 'west'];
