import type { KnownNode, KnownSpaceScope } from './graph.types';
import type { KnowledgeAnchor } from './types';

export interface RoomConnectionsScope extends KnownSpaceScope { cursor?: string; limit?: number }
export type ConnectionRoom = KnownNode & { kind: 'room' };
export interface RoomConnection {
  room: ConnectionRoom;
  // A deterministic commitment to a validated path, not an authority token or executable route.
  proof: { digest: string; steps: number; crossings: number };
}
export interface RoomConnectionsPage {
  anchor: KnowledgeAnchor;
  from: ConnectionRoom;
  items: RoomConnection[];
  // Completeness concerns the indexed exits of this room, not unobserved room geometry.
  state: 'complete' | 'partial';
  reason?: 'unseen-passage';
  next?: string;
}
