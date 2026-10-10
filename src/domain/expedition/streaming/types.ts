import type { Direction } from '../../types';
import type { CellAddress, ExpeditionKnowledge, KnownCell, KnownChest, KnownOpening, SpaceGeometry } from '../types';
import type { ExpansionSocket, TopologyConnection, TopologyHeader, TopologySpace } from '../topology/types';

export interface KnownFrontier extends CellAddress { id: string; direction: Direction; observedAt: number }

/** A bounded discovered-space page, never a generated-world manifest. */
export interface StreamKnowledgePage extends ExpeditionKnowledge {
  version: 1;
  spaceId: string;
  revision: number;
  frontiers: Record<string, KnownFrontier>;
  parentOpeningId?: string;
  completedExits: string[];
  cleared: boolean;
}

export interface StreamCheckpoint {
  version: 2;
  worldId: string;
  floorId: string;
  scopeId: string;
  revision: number;
  topologyRevision: number;
  position: CellAddress;
  home: CellAddress;
  phase: 'exploring' | 'complete';
  moves: number;
  visitedSpaces: number;
  clearedSpaces: number;
  collectedChests: number;
}

/** Host-only data. Never send this object across the planning-adapter boundary. */
export interface StreamRoom {
  space: TopologySpace;
  connections: TopologyConnection[];
  sockets: ExpansionSocket[];
  knowledge?: StreamKnowledgePage;
}

export interface StreamObservation {
  version: 2;
  worldId: string;
  floorId: string;
  scopeId: string;
  revision: number;
  topologyRevision: number;
  position: CellAddress;
  phase: StreamCheckpoint['phase'];
  visibleCells: KnownCell[];
  visibleOpenings: KnownOpening[];
  visibleChests: KnownChest[];
  visibleFrontiers: KnownFrontier[];
}

export type StreamCommand = { type: 'move'; direction: Direction } | { type: 'collect' }
  | { type: 'prepare'; frontierId: string } | { type: 'finish' };

export interface StreamCommandContext {
  header: TopologyHeader;
  checkpoint: StreamCheckpoint;
  current: StreamRoom;
  loadRoom(id: string): Promise<StreamRoom>;
  /** Exactly one canonical expansion in the SAME transaction as the command. */
  prepareNext(): Promise<TopologyHeader>;
  geometry(space: TopologySpace): SpaceGeometry;
}

export interface StreamTransition {
  applied: boolean;
  reason: string;
  checkpoint: StreamCheckpoint;
  pages: StreamKnowledgePage[];
  observation: StreamObservation;
}

export interface StreamActionRequest {
  version: 2;
  actionId: string;
  sessionId: string;
  epoch: number;
  expectedRevision: number;
  expectedTopologyRevision: number;
  command: StreamCommand;
}

export interface StreamActionResult {
  actionId: string;
  disposition: 'applied' | 'refused' | 'conflict' | 'unavailable';
  beforeRevision: number;
  afterRevision: number;
  topologyRevision: number;
  reason: string;
  observation?: StreamObservation;
}

export interface StreamControl { sessionId: string; epoch: number }
export interface StreamActionReceipt { request: StreamActionRequest; signature: string; result: StreamActionResult }
export interface StreamDecision { command?: StreamCommand; reason: string; target?: CellAddress }
