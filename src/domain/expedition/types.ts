import type { Direction, GridPosition, MazeCellState } from '../types';

export interface CellAddress extends GridPosition { spaceId: string }

export interface ExpeditionRecipe {
  version: 'spaces-v1';
  worldId: string;
  floorId: string;
  level: number;
  seed: number;
}

export interface SpaceOpening {
  id: string;
  cell: GridPosition;
  direction: Direction;
  destination: CellAddress;
}

export interface SpaceSpec {
  id: string;
  kind: 'room' | 'passage';
  name: string;
  origin: GridPosition;
  rows: number;
  columns: number;
  seed: number;
  openings: SpaceOpening[];
  chests: { id: string; cell: GridPosition }[];
}

/** A closed, bounded first fixture. Macro expansion is a separate later gate. */
export interface ExpeditionPlan {
  recipe: ExpeditionRecipe;
  scopeId: string;
  spaces: SpaceSpec[];
  start: CellAddress;
}

export interface SpaceGeometry {
  spaceId: string;
  rows: number;
  columns: number;
  cells: MazeCellState[];
}

export interface KnownCell extends CellAddress { links: Direction[]; observedAt: number }
export interface KnownOpening extends CellAddress {
  id: string;
  direction: Direction;
  destination?: CellAddress;
  observedAt: number;
}
export interface KnownChest extends CellAddress { id: string; opened: boolean; observedAt: number }

export interface ExpeditionKnowledge {
  cells: Record<string, KnownCell>;
  openings: Record<string, KnownOpening>;
  chests: Record<string, KnownChest>;
}

export interface ExpeditionCheckpoint {
  version: 1;
  worldId: string;
  floorId: string;
  scopeId: string;
  revision: number;
  position: CellAddress;
  home: CellAddress;
  openedChestIds: string[];
  knowledge: ExpeditionKnowledge;
  phase: 'exploring' | 'returning' | 'complete';
  moves: number;
}

/** This is deliberately not a world-plan or renderer projection. */
export interface ExpeditionObservation {
  version: 1;
  worldId: string;
  floorId: string;
  scopeId: string;
  revision: number;
  position: CellAddress;
  visibleCells: KnownCell[];
  visibleOpenings: KnownOpening[];
  visibleChests: KnownChest[];
  phase: ExpeditionCheckpoint['phase'];
}

export type ExpeditionCommand = { type: 'move'; direction: Direction } | { type: 'collect' } | { type: 'finish' };

export interface ExplorationDecision {
  command?: ExpeditionCommand;
  target?: CellAddress;
  reason: string;
}
