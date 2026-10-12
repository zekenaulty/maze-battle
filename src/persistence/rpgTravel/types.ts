import type { RpgAddress } from '../../domain/agentic/knowledge/types';
import type { DestinationOperation } from '../../domain/directed/destinationExecution';
import type { DestinationLimits } from '../../domain/directed/destinationLimits';
import type { SaveControl } from '../saveControl';
import type { GameCommandReceipt } from '../gameCommandTypes';
import type { Direction } from '../../domain/types';
import type { ExplorationNotice } from '../../domain/agentic/explorationPolicy';

export interface RpgFrontierTarget { anchor: RpgAddress; direction: Direction; sourceId: string }
export interface RpgExploration {
  policy: 'corridor-v1'; phase: 'approach' | 'corridor'; trail: RpgAddress[]; decision?: ExplorationNotice;
}
export type RpgTravelAction = { type: 'start'; target: RpgAddress; limits: DestinationLimits }
  | { type: 'explore'; frontier: RpgFrontierTarget; limits: DestinationLimits; continuation?: 'corridor-v1' }
  | { type: 'step'; sequence: number } | { type: 'cancel' } | { type: 'adopt' };
export interface RpgTravelRequest {
  attemptId: string; operationId: string; gameId: string; control: SaveControl;
  deadlineAt: number; action: RpgTravelAction;
}
export interface RpgTravelRecord {
  version: 1; id: string; gameId: string; control: SaveControl; position: RpgAddress;
  sourceHead: string; operation: DestinationOperation<RpgAddress>; witness: string;
  frontier?: RpgFrontierTarget;
  exploration?: RpgExploration;
}
export interface RpgTravelReceipt {
  version: 1; attemptId: string; fingerprint: string; committedAt: number;
  disposition: 'applied' | 'refused' | 'conflict' | 'unavailable' | 'settled'; reason: string;
  travel?: RpgTravelRecord; command?: GameCommandReceipt; witness: string;
}
