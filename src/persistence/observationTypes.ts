import type { RpgObservation } from '../domain/agentic/knowledge/types';

/** Immutable source evidence. Saves retain a head, never a mutable global knowledge pointer. */
export interface RpgObservationNode {
  version: 1;
  id: string;
  gameId: string;
  depth: number;
  /** ancestors[k] is the source 2**k records before this one. */
  ancestors: string[];
  observation: RpgObservation;
}

export interface RpgHistoryCursor { id: string; depth: number }
export interface RpgHistoryRequest {
  snapshotId?: string;
  cursor?: RpgHistoryCursor;
  limit?: number;
}
export interface RpgHistoryPage {
  snapshotId?: string;
  records: RpgObservationNode[];
  next?: RpgHistoryCursor;
  /** Point reads, including the ancestry proof; no unbounded scans. */
  reads: number;
}
