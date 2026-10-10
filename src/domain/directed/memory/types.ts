import type { CellAddress } from '../../expedition/types';
import type { Direction } from '../../types';
import type { ExaminedFeature, InspectionEvidence, PerceptionProvenance, SuspiciousCue } from '../perceptionTypes';
import type { DirectedCell, DirectedSpace, ObservedFeature } from '../types';

export interface MemoryIdentity { worldId: string; observerId: string; floorId: string }
export interface MemoryBounds {
  bytes: number;
  cells: number;
  rooms: number;
  facts: number;
  connections: number;
  nearHops: number;
  searchCells: number;
}
export interface MemoryEvidence {
  sourceIds: string[];
  oldestObservedAt: number;
  latestObservedAt: number;
  status: 'current' | 'stale';
}
export interface MemoryFact<T> {
  value: T;
  observationId: string;
  observedAt: number;
  evidence: MemoryEvidence;
}
export interface GeographicBearing {
  direction: Direction | 'north-east' | 'south-east' | 'south-west' | 'north-west' | 'here' | 'unknown';
  basis: 'remembered-coordinates';
  evidence?: MemoryEvidence;
}
export type MemoryRoute = {
  status: 'known-route'; distance: number; firstRouteDirection: Direction | null; evidence: MemoryEvidence;
} | {
  status: 'inaccessible'; reason: 'no-known-route'; evidence: MemoryEvidence;
} | {
  status: 'unknown'; reason: 'origin-not-remembered' | 'destination-not-remembered';
};
export interface RoomMemorySummary {
  roomId: string;
  name: string | null;
  detail: 'summary-only';
  knownCells: number;
  knownFeatures: number;
  geographicBearing: GeographicBearing;
  route: MemoryRoute;
  evidence: MemoryEvidence;
}
export interface RoomConnection {
  from: CellAddress;
  to: CellAddress;
  direction: Direction;
  status: 'remembered-passable' | 'remembered-blocked' | 'unknown-destination';
  evidence: MemoryEvidence;
}
export interface CurrentRoomMemory {
  roomId: string;
  status: 'known' | 'unknown';
  space?: MemoryFact<DirectedSpace>;
  cells: MemoryFact<DirectedCell>[];
  features: MemoryFact<ObservedFeature>[];
  examinations: MemoryFact<ExaminedFeature>[];
  blockedEdges: MemoryFact<{ from: CellAddress; to: CellAddress }>[];
}
export interface MemoryOmittedCounts {
  rooms: number; spaceDetails: number; cells: number; features: number; examinations: number; blockedEdges: number;
  connections: number; absent: number; cues: number; perception: number; inspection: number;
}
export interface MemoryOmissions extends MemoryOmittedCounts {
  causes: { scope: boolean; cells: boolean; rooms: boolean; facts: boolean; connections: boolean; bytes: boolean };
}
export interface MemoryEnvelope extends MemoryIdentity {
  version: 'directed-memory-v1';
  knowledgeRevision: number;
  position: CellAddress;
  bounds: MemoryBounds;
  sourceIds: string[];
  omissions: MemoryOmissions;
  unknowns: readonly string[];
}
export type InspectionMemory = Omit<InspectionEvidence, 'coveredCells'> & {
  coveredCellCount: number; coverageDetail: 'omitted';
};
export interface DirectedMemoryOverview extends MemoryEnvelope {
  kind: 'overview';
  currentRoom: CurrentRoomMemory;
  nearby: RoomMemorySummary[];
  distant: RoomMemorySummary[];
  connections: RoomConnection[];
  perception?: MemoryFact<PerceptionProvenance>;
  cues?: { frame: 'source-observation-only'; fact: MemoryFact<SuspiciousCue[]> };
  inspection?: MemoryFact<InspectionMemory>;
}
export type MemoryDestination = { kind: 'room'; roomId: string }
  | { kind: 'cell'; address: CellAddress }
  | { kind: 'feature'; featureId: string };
export interface DirectedDestinationMemory extends MemoryEnvelope {
  kind: 'destination';
  target: MemoryDestination;
  status: 'known' | 'unknown' | 'absent';
  room?: RoomMemorySummary;
  cell?: MemoryFact<DirectedCell>;
  feature?: MemoryFact<ObservedFeature>;
  absence?: MemoryFact<{ featureId: string }>;
  examination?: MemoryFact<ExaminedFeature>;
  geographicBearing: GeographicBearing;
  route: MemoryRoute;
}
/** Exact JSON is ready for the parent's presentation journal, not persisted here. */
export interface MemoryPacket<T extends MemoryEnvelope> { memory: T; json: string; bytes: number }
