import type { RosterState } from '../../domain/party/roster';
import type { BattleState, QuestState } from '../../domain/types';
import type { GuildContract } from '../../domain/guild/contractFactory';
import type { GameCheckpoint } from '../../persistence/canonical/game/checkpoint';
import type { ObservationHeader, ObservedCell } from '../../persistence/canonical/knowledge/types';
import type { CanonicalSnapshot, CanonicalWorkStats } from '../../persistence/canonical/types';
import type { SpatialView } from './SpatialView';

/** Bounded UI projection, never serialized as game authority or used as a world map. */
export interface GameView extends Omit<RosterState, 'mode'> {
  id: string;
  mode: GameCheckpoint['mode'];
  checkpoint: GameCheckpoint;
  snapshot: CanonicalSnapshot;
  observation: { header: ObservationHeader; cells: ObservedCell[] } | null;
  spatial?: SpatialView;
  quests: QuestState[];
  contracts: GuildContract[];
  autoThrottleMs: number;
  randomBattles: boolean;
  battle?: BattleState;
  battleAutomationPaused?: boolean;
}
export interface GameDiagnostic {
  revision: number;
  action: string;
  replayed: boolean;
  elapsedMs: number;
  stats: CanonicalWorkStats;
}
