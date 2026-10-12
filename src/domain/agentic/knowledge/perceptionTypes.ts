import type { RpgAddress, RpgObservedCell, RpgRememberedCell, RpgSource } from './types';

/** An explicit view request, not the world's extent. End coordinates are exclusive. */
export interface RpgPerceptionScope {
  readonly floor: number;
  readonly row: number;
  readonly column: number;
  readonly rows: number;
  readonly columns: number;
}

/** Visibility is as-of the region source, not a claim of present live sight. */
export type RpgPerceivedCell =
  | { readonly state: 'visible'; readonly fact: RpgRememberedCell; readonly observation: RpgObservedCell }
  | { readonly state: 'remembered'; readonly fact: RpgRememberedCell };

/** Unknown cells are absent. No layout, generator, loot table or live world is included. */
export interface RpgPerceptionRegion {
  readonly kind: 'perception-region';
  readonly snapshotId: string;
  readonly source: RpgSource;
  readonly actor: RpgAddress;
  readonly scope: RpgPerceptionScope;
  readonly cells: readonly RpgPerceivedCell[];
}
