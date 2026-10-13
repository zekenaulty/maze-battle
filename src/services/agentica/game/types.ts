import type { KnowledgeRead } from '../../../persistence/canonical/knowledge/types';
import type { ProtocolRead } from '../../../persistence/canonical/agentica/types';

export type PerceptionPages = KnowledgeRead & ProtocolRead;
export interface InspectArgs {
  scope: 'room' | 'map' | 'cell';
  level?: number; spaceId?: string; row?: number; column?: number; cursor?: string;
}
export interface CellAddress { level: number; spaceId: string; row: number; column: number }
export interface InspectQuery { scope: InspectArgs['scope']; level: number; spaceId?: string; row?: number; column?: number }
export const MAX_CONTEXT_BYTES = 768;
export const MAX_OBSERVATION_BYTES = 2800;
export const MAX_PERCEPTION_READS = 256;
export const MAX_PERCEPTION_READ_BYTES = 1024 * 1024;
export const ROOM_WINDOW_SIDE = 16;
export const ROOM_PAGE_SLOTS = 16;
export const MAP_PAGE_ROOMS = 4;
