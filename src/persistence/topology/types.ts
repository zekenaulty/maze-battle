import type { ExpansionSocket, Occupancy, TopologyConnection, TopologyDelta, TopologyHeader, TopologySpace } from '../../domain/expedition/topology/types';

export interface TopologyRoot {
  header: TopologyHeader;
  quotaBytes: number;
  serializedBytes: number;
  streamVersion?: 1;
  /** Opaque external identity. The internal header.scopeId contains the recipe. */
  publicScopeId?: string;
}
export interface TopologySpacePage { space: TopologySpace; connections: TopologyConnection[]; socketSequences?: number[] }
export interface ExpansionRequest { scopeId: string; requestId: string; expectedRevision: number }
export interface ExpansionReceipt {
  request: ExpansionRequest;
  status: 'committed' | 'sealed';
  header: TopologyHeader;
  delta?: TopologyDelta;
}
export type ExpansionResult = ExpansionReceipt | { status: 'conflict'; revision: number };
export interface TopologyRecords {
  roots: TopologyRoot;
  spaces: TopologySpacePage;
  sockets: ExpansionSocket;
  buckets: Occupancy[];
  receipts: ExpansionReceipt;
}

export const TOPOLOGY_DATABASE = 'maze-battle-topology-v2';
export const DEFAULT_TOPOLOGY_QUOTA = 32 * 1024 * 1024;
export const MAX_TOPOLOGY_QUOTA = 256 * 1024 * 1024;
