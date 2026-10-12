import type { Direction } from '../../types';

export const RPG_KNOWLEDGE_LIMITS = Object.freeze({
  radius: 16, observationCells: 545, chestsPerCell: 8, roomsPerCell: 8,
  retainedCells: 2048, retainedFloors: 16, routeVisits: 512, routeSteps: 256,
  contextCells: 64, contextRadius: 7, contextRooms: 12, connectionSources: 16, idLength: 128,
});

export interface RpgAddress { readonly floor: number; readonly row: number; readonly column: number }
/** Structurally compatible with SaveControl; supplied by the canonical transaction. */
export interface RpgRevision { readonly owner: string; readonly epoch: number; readonly revision: number }
export interface RpgObservationIdentity {
  readonly id: string;
  readonly revision: RpgRevision;
  readonly observedAt: string;
}
export interface RpgSource extends RpgObservationIdentity { readonly gameId: string }
export interface RpgObservedChest {
  readonly id: string;
  readonly position: RpgAddress;
  readonly opened: boolean;
}
export type RpgStair = 'up' | 'down' | 'town';
export interface RpgCellDetails {
  readonly address: RpgAddress;
  readonly roomIds: readonly string[];
  readonly chests: readonly RpgObservedChest[];
  readonly stairs: readonly RpgStair[];
}
export interface RpgObservedCell extends RpgCellDetails {
  /** Only open edges whose two endpoints are in this receipt. */
  readonly links: readonly Direction[];
  /** Missing physical exits at this visible cell, including toward unseen cells. */
  readonly blocked: readonly Direction[];
}
export interface RpgObservation extends RpgSource {
  readonly status: 'observed';
  readonly version: 1;
  readonly policy: { readonly kind: 'rpg-linked-bfs-v1'; readonly radius: number };
  readonly actor: RpgAddress;
  readonly cells: readonly RpgObservedCell[];
}
export interface RpgEdgeFact {
  readonly state: 'open' | 'blocked';
  readonly source: RpgSource;
}
export interface RpgRememberedCell extends RpgCellDetails {
  readonly source: RpgSource;
  readonly edges: Readonly<Partial<Record<Direction, RpgEdgeFact>>>;
}
export interface RpgFloorKnowledge {
  readonly cells: Readonly<Record<string, RpgRememberedCell>>;
  /** Keys are encoded room IDs; values index only earned cell associations. */
  readonly rooms: Readonly<Record<string, readonly string[]>>;
}
export interface RpgKnowledge {
  readonly status: 'known';
  readonly version: 1;
  readonly gameId: string;
  readonly source: RpgSource;
  readonly actor: RpgAddress;
  readonly cellCount: number;
  readonly floors: Readonly<Record<number, RpgFloorKnowledge>>;
}
export type RpgRefusalReason = 'invalid_identity' | 'invalid_checkpoint' | 'observation_limit'
  | 'scope_mismatch' | 'out_of_order' | 'duplicate_source' | 'knowledge_limit' | 'invalid_budget'
  | 'cross_floor' | 'visit_limit' | 'step_limit' | 'invalid_as_of' | 'context_limit';
export interface RpgRefusal { readonly status: 'refused'; readonly reason: RpgRefusalReason }
export interface RpgUnknown {
  readonly status: 'unknown';
  readonly reason: 'origin_unknown' | 'target_unknown' | 'room_unknown' | 'no_known_route';
}
export interface RpgRouteBudget { readonly maxVisits: number; readonly maxSteps: number }
export interface RpgKnownRoute {
  readonly status: 'ready';
  readonly origin: RpgAddress;
  readonly target: RpgAddress;
  readonly path: readonly RpgAddress[];
  readonly directions: readonly Direction[];
  readonly distance: number;
  readonly visits: number;
  readonly sources: readonly RpgSource[];
}
export interface RpgContextCell extends RpgCellDetails {
  readonly source: RpgSource;
  /** Null when clock correction prevents a meaningful wall-clock age. Source order is revision-based. */
  readonly ageMs: number | null;
  readonly edges: readonly { readonly direction: Direction; readonly state: 'open' | 'blocked';
    readonly source: RpgSource; readonly ageMs: number | null }[];
}
