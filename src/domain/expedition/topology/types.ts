import type { Direction, GridPosition } from '../../types';
import type { CellAddress, SpaceSpec } from '../types';

export interface TopologyRecipe {
  version: 'spaces-v2';
  worldId: string;
  floorId: string;
  level: number;
  seed: number;
}

export interface Bounds extends GridPosition { rows: number; columns: number }
export interface TopologySpace {
  schematic: 'stone-room-v1';
  spec: SpaceSpec;
}

/** A reservation is not an opening. Only a committed connection permits travel. */
export interface ExpansionSocket {
  id: string;
  sequence: number;
  source: CellAddress;
  direction: Direction;
  fallback: Bounds;
  status: 'pending' | 'linked';
}

export interface TopologyConnection {
  id: string;
  from: CellAddress;
  to: CellAddress;
  direction: Direction;
}

export interface TopologyHeader {
  version: 1;
  recipe: TopologyRecipe;
  scopeId: string;
  revision: number;
  start: CellAddress;
  roomBudget: number;
  rooms: number;
  nextSocket: number;
  socketCount: number;
  seal?: { revision: number; reason: 'budget' | 'spatial-limit' };
}

export interface Occupancy { id: string; kind: 'space' | 'reservation'; bounds: Bounds }
export interface TopologyReader {
  header(): TopologyHeader;
  space(id: string): TopologySpace | undefined;
  socket(sequence: number): ExpansionSocket | undefined;
  occupied(bounds: Bounds, except?: string): boolean;
}

/** One atomic commit; never publish one endpoint, reservation or counter alone. */
export interface TopologyDelta {
  scopeId: string;
  expectedRevision: number;
  requestId: string;
  header: TopologyHeader;
  spaces: TopologySpace[];
  sockets: ExpansionSocket[];
  resolved?: ExpansionSocket;
  connections: TopologyConnection[];
  addOccupancy: Occupancy[];
  removeOccupancy: string[];
  work: { candidates: number; occupancyQueries: number };
}

export type ExpansionProposal = { status: 'ready'; delta: TopologyDelta }
  | { status: 'sealed' | 'conflict'; revision: number };
