import type { Direction } from '../../../types';
import type { SpaceSpec } from '../../types';
import type { Occupancy, TopologyConnection } from '../types';
import type { ModuleRecipe } from './policy';

export interface ModuleSocket {
  id: string;
  sourceId: string;
  direction: Direction;
  room: SpaceSpec;
  passage?: SpaceSpec;
  reservation: Occupancy;
}

export interface ModuleJoin {
  id: string;
  fromRoomId: string;
  toRoomId: string;
  direction: Direction;
  passageId?: string;
}

export interface ModuleAssemblyState {
  recipe: ModuleRecipe;
  scopeId: string;
  revision: number;
  rooms: number;
  nextSequence: number;
  spaces: SpaceSpec[];
  joins: ModuleJoin[];
  connections: TopologyConnection[];
  pending: ModuleSocket[];
}

export interface ModuleWork { candidates: number; occupancyQueries: number; localChecks: number }

export interface ModuleDelta {
  scopeId: string;
  expectedRevision: number;
  requestId: string;
  resolved: string;
  spaces: SpaceSpec[];
  join: ModuleJoin;
  connections: TopologyConnection[];
  pending: ModuleSocket[];
  work: ModuleWork;
}

export class ModuleCapacityError extends Error {
  readonly reason: 'modules' | 'projection' | 'spatial' | 'quality';
  constructor(reason: ModuleCapacityError['reason'], message: string) {
    super(message);
    this.reason = reason;
    this.name = 'ModuleCapacityError';
  }
}
