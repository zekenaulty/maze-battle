import type { Direction, GridPosition } from '../../../domain/types';
import type { WorldPosition } from '../world/types';
import type { CellSource, KnowledgeAnchor } from './types';

export type KnownKind = 'room' | 'passage';
export type KnownFilter = KnownKind | 'all';
export interface KnownAnchor { at: WorldPosition; world: GridPosition; source: CellSource }
export interface KnownNode { level: number; spaceId: string; kind: KnownKind; anchor: KnownAnchor }
export interface KnownLink { id: string; from: KnownAnchor; to: KnownAnchor; direction: Direction }
export interface KnownPage<T> { anchor: KnowledgeAnchor; items: T[]; next?: string }
export interface KnownNodesScope { level: number; kind: KnownFilter; cursor?: string; limit?: number }
export interface KnownSpaceScope { level: number; spaceId: string }
export interface KnownLinksScope extends KnownSpaceScope { cursor?: string; limit?: number }
export class KnownGraphUnavailableError extends Error {
  readonly code = 'known-graph-unavailable';
  constructor() { super('Known graph unavailable: history has no earned graph projection'); this.name = 'KnownGraphUnavailableError'; }
}

export interface GraphList { first: string | null; last: string | null; count: number }
export interface GraphFloor { schema: 1; level: number; lists: Record<KnownFilter, GraphList> }
export interface GraphNode {
  schema: 1; node: KnownNode;
  ordinal: { all: number; kind: number };
  next: { all: string | null; kind: string | null };
}
export interface GraphLinks { schema: 1; level: number; spaceId: string; links: KnownLink[] }
