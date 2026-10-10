import type { StreamCheckpoint, StreamObservation, StreamRoom } from '../domain/expedition/streaming/types';
import type { TopologySpace } from '../domain/expedition/topology/types';
import type { SpaceGeometry } from '../domain/expedition/types';

export type StreamGeometryReader = (space: TopologySpace) => SpaceGeometry;
/** Host-only room data; planning adapters must receive observation/knowledge only. */
export interface StreamSnapshot { checkpoint: StreamCheckpoint; room: StreamRoom; observation: StreamObservation }
