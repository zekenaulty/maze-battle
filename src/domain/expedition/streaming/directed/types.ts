import type { DestinationOperation } from '../../../directed/destinationExecution';
import type { CellAddress } from '../../types';
import type { StreamActionRequest, StreamCheckpoint, StreamControl, StreamKnowledgePage } from '../types';

export type StreamDestination =
  | { kind: 'cell'; address: CellAddress; arrival: 'occupy' }
  | { kind: 'chest'; chestId: string; address: CellAddress; arrival: 'occupy' }
  | { kind: 'doorway'; openingId: string; address: CellAddress; arrival: 'approach' }
  | { kind: 'doorway'; openingId: string; address: CellAddress; arrival: 'cross'; destination: CellAddress };

export interface DirectedStreamFrame { checkpoint: StreamCheckpoint; control: StreamControl }
export type ReadDirectedKnowledge = (spaceId: string) => Promise<StreamKnowledgePage | undefined>;
export interface ObservedBlock { from: CellAddress; to: CellAddress; revision: number }
export interface DirectedStreamMove {
  request: StreamActionRequest & { command: { type: 'move'; direction: 'north' | 'east' | 'south' | 'west' } };
  from: CellAddress;
  to: CellAddress;
  kind: 'local' | 'crossing';
}

/** Serializable travel state, not a world snapshot or an automatic objective. */
export interface DirectedStreamTravel {
  operation: DestinationOperation<StreamDestination>;
  frame: DirectedStreamFrame;
  blocked: ObservedBlock[];
  paused: boolean;
  pending?: DirectedStreamMove;
}

export interface DirectedStreamStep {
  operationId: string;
  sequence: number;
  actionId: string;
}
