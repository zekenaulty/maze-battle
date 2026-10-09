import type { Direction } from '../types';
import type { CellAddress } from '../expedition/types';

export const DIRECTED_VERSION = 'directed-v1' as const;
export const DIRECTED_LIMITS = { cells: 512, steps: 64, replans: 4, bytes: 65_536, history: 4096 } as const;
export interface DirectedCell {
  address: CellAddress;
  exits: Partial<Record<Direction, CellAddress>>;
}
export interface DirectedSpace {
  id: string; name: string; originX: number; originZ: number; rows: number; columns: number;
}
export interface WorldFeature {
  id: string;
  kind: 'lever' | 'door' | 'trap' | 'chest' | 'altar';
  name: string;
  position: CellAddress;
  state: 'idle' | 'active' | 'locked' | 'closed' | 'open';
  hidden?: boolean;
}
/** Host-only truth. Never serialize this into an actor response. */
export interface DirectedWorld {
  id: string; floorId: string; revision: number;
  spaces: Record<string, DirectedSpace>;
  cells: Record<string, DirectedCell>;
  features: Record<string, WorldFeature>;
}
export interface DirectedActor { id: string; position: CellAddress }
export interface ObservedFeature {
  id: string; kind: WorldFeature['kind']; name: string; position: CellAddress; state: WorldFeature['state'];
}
export interface PerceivedScene {
  position: CellAddress;
  cells: DirectedCell[];
  spaces: DirectedSpace[];
  features: ObservedFeature[];
  absentFeatureIds: string[];
}
/** Immutable source evidence; sourceWorldRevision is audit-only, not actor context. */
export interface ObservationReceipt {
  id: string; worldId: string; observerId: string; sequence: number; sourceWorldRevision: number;
  policyVersion: 'fixture-visibility-v1';
  reason: 'prelude' | 'look' | 'travel' | 'interaction' | 'obstruction';
  coverage: { radius: number; basis: 'connected-cells'; complete: true };
  scene: PerceivedScene;
}
export interface Remembered<T> { value: T; observationId: string; observedAt: number }
export interface KnowledgeProjection {
  worldId: string; observerId: string; revision: number;
  cells: Record<string, Remembered<DirectedCell>>;
  spaces: Record<string, Remembered<DirectedSpace>>;
  features: Record<string, Remembered<ObservedFeature>>;
  absent: Record<string, { observationId: string; observedAt: number }>;
}
export interface PresentedContext {
  id: string; observerId: string; knowledgeRevision: number;
  purpose: 'human-view' | 'decision-fixture';
  observationIds: string[];
  /** Exact UTF-8 JSON supplied to the consumer, not reconstructed later. */
  json: string; bytes: number;
}
export interface WorldEvent {
  id: string; revision: number; type: 'move' | 'interact' | 'fixture-change';
  subjectId: string; position?: CellAddress; before?: string; after?: string;
}
