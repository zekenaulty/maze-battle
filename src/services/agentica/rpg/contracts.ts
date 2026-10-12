import type { RpgAddress } from '../../../domain/agentic/knowledge/types';
import type { DestinationLimits } from '../../../domain/directed/destinationLimits';
import type { SaveControl } from '../../../persistence/saveControl';
import type { RpgFrontierTarget } from '../../../persistence/rpgTravel/types';

export interface RpgAgenticaBinding {
  protocolVersion: 1; hostId: 'maze-battle'; sessionId: string; sessionEpoch: string;
  scopeId: string; perspectiveId: 'party'; gameId: string; floor: number;
  objectiveId: string; objective: string; runId: string; manifestHash: string;
  control: SaveControl; completionTarget: RpgAddress; travelLimits: DestinationLimits;
  parentOperationId?: string;
  mode?: 'exploration' | 'quest';
  quest?: { id: string; baseId: string; token: string; required: number };
}

export type RpgContextCommand = { type: 'inspect'; target: RpgAddress }
  | { type: 'room'; roomId: string; limit: number; snapshotId?: string; after?: string }
  | { type: 'map'; limit: number; snapshotId?: string; after?: string }
  | { type: 'frontiers'; limit: number; snapshotId?: string; after?: string };
export type RpgCommand = { type: 'observe' } | { type: 'navigate'; target: RpgAddress }
  | { type: 'open-chest'; chestId: string } | { type: 'quest-status' }
  | { type: 'explore'; frontier: RpgFrontierTarget; continuation?: 'corridor-v1' } | RpgContextCommand;
