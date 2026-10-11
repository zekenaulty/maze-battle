import type { GridPosition } from '../../src/domain/types';
import type { Bounds } from '../../src/domain/expedition/topology/types';
import type { inspectStreamedSnapshot } from './streamed-inspection';

export const STREAMED_LIMITS = Object.freeze({ rooms: 512, iterations: 512, cells: 512 * 1023 });

export type IndexWork = { queries: number; bucketReads: number; entryChecks: number };

export type ProposalWork = {
  generationCalls: number;
  candidates: number | null;
  occupancyQueryBudget: number | null;
  emptyReaderQueries: number;
  index: IndexWork;
};

export type GenerationWork = {
  canonicalProposal: ProposalWork;
  commitRevalidation: ProposalWork;
  commitInsertion: IndexWork;
  totalIndex: IndexWork;
  localReservationOverlapComparisons: null;
};

export type StreamedGeometry = {
  rooms: (Bounds & { id: string; kind: 'room' | 'passage' })[];
  passages: (Bounds & { id: string; kind: 'room' | 'passage' })[];
  connections: { from: string; to: string; fromDoor: GridPosition; toDoor: GridPosition }[];
};

type Inspection = ReturnType<typeof inspectStreamedSnapshot>;

export type StreamedMeasurement = {
  seed: number | null;
  level: number | null;
  version: 'spaces-v2';
  status: 'complete' | 'limited' | 'error';
  metrics: {
    requestedRooms: number | null;
    materializedRooms: number | null;
    materializedPassages: number | null;
    sealReason: 'budget' | 'spatial-limit' | null;
    limitReason: 'room-cap' | 'iteration-cap' | null;
    limits: { requestedMaxRooms: number | null; effectiveMaxRooms: number | null; maxIterations: number; maxCells: number };
    iterations: number;
    revision: number | null;
    sockets: { total: number; linked: number; pending: number; utilization: number | null } | null;
    roomGraph: Inspection['roomGraph'];
    roomFootprint: Inspection['roomFootprint'] | null;
    passageFootprint: Inspection['passageFootprint'] | null;
    spaceBounds: Bounds | null;
    validation: Inspection['validation'] | null;
    physicalTraversal: Inspection['physicalTraversal'];
    work: GenerationWork | null;
    error: string | null;
    notes: string[];
  };
  geometry: StreamedGeometry;
};
