import type { StreamKnowledgePage } from '../domain/expedition/streaming/types';

export const STREAM_MAP_PAGE_LIMIT = 12;
/** scopeId is the public UUID, never the internal recipe-bearing scope. */
export interface StreamMapView { scopeId: string; revision: number; topologyRevision: number }
export interface StreamMapSummary {
  spaceId: string; pageRevision: number; knownCells: number; knownOpenings: number;
  knownFrontiers: number; knownChests: number; openedChests: number; cleared: boolean;
}
export interface StreamMapListOptions { cursor?: string; limit?: number; expectedView?: StreamMapView }
export interface StreamMapListing { view: StreamMapView; summaries: StreamMapSummary[]; nextCursor?: string }
export interface StreamMapReadOptions { expectedView: StreamMapView; expectedPageRevision?: number }
/** pageRevision is the last saved page update; each entry keeps its own observedAt. */
export interface StreamMapPage { view: StreamMapView; pageRevision: number; knowledge: StreamKnowledgePage }
export type StreamMapErrorCode = 'INVALID_REQUEST' | 'MISSING_SLOT' | 'PUBLIC_SCOPE_REQUIRED' | 'STALE_VIEW' | 'CORRUPT_RECORD';
export class StreamMapError extends Error {
  readonly code: StreamMapErrorCode;
  constructor(code: StreamMapErrorCode) { super(`Stream map: ${code}`); this.name = 'StreamMapError'; this.code = code; }
}
