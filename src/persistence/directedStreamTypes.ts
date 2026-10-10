import type { DirectedStreamTravel } from '../domain/expedition/streaming/directed/types';
import type { StreamActionRequest, StreamActionResult, StreamCheckpoint, StreamControl } from '../domain/expedition/streaming/types';

export interface DirectedStreamHead { version: 1; operationId: string }
export interface StoredDirectedStreamOperation {
  version: 1;
  revision: number;
  state: DirectedStreamTravel;
  lastAttempt?: { request: StreamActionRequest; outcome: 'settled'; result: StreamActionResult }
    | { request: StreamActionRequest; outcome: 'revoked' };
}
export interface DirectedStreamSession {
  control: StreamControl;
  checkpoint: StreamCheckpoint;
  record?: StoredDirectedStreamOperation;
}
