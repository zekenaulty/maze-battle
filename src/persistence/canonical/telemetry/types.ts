import type { SkillId } from '../../../domain/types';
import type { WorldPosition } from '../world/types';

export const GAMEPLAY_TRACE_CAPACITY = 64;
export const MAX_GAMEPLAY_TRACE_RECORD_BYTES = 4096;
export const GAMEPLAY_TRACE_HEADER = 'telemetry/gameplay/header';
export const gameplayTraceSlot = (sequence: number) => `telemetry/gameplay/slot/${(sequence - 1) % GAMEPLAY_TRACE_CAPACITY}`;

export interface ActorResources {
  hp: number; mp: number; level: number; xp: number; gold: number; autoBattle: boolean;
}
export interface ActorChange { id: string; before: ActorResources; after: ActorResources }
export interface BattleTraceTrigger {
  kind: 'start' | 'skill' | 'round' | 'tick' | 'end' | 'automation' | 'actor-auto';
  actorId?: string; skillId?: SkillId;
}
export interface BattleFact {
  kind: 'battle';
  event: 'started' | 'turn' | 'won' | 'lost' | 'abandoned' | 'closed-lost' | 'paused' | 'resumed' | 'stalled';
  battleId: string; origin: WorldPosition;
  trigger: BattleTraceTrigger['kind']; actorId: string | null; skillId: SkillId | null;
  returnMode: 'manual' | 'auto-play' | 'waves'; status: 'active' | 'won' | 'lost'; round: number; paused: boolean;
  newlyDefeatedCount: number;
  pendingGold: { before: number; after: number };
  pendingLootCount: { before: number; after: number };
  walletGoldDelta: number; lootAwardCount: number;
  actors: ActorChange[];
}
export interface RewardFact {
  kind: 'reward'; command: 'open-chest' | 'claim-quest'; targetId: string;
  walletGoldBefore: number; walletGoldAfter: number; lootAwardCount: number;
}
export type GameplayFact = BattleFact | RewardFact;
export interface GameplayTraceEntry { sequence: number; revision: number; at: string; fact: GameplayFact }
export interface GameplayTrace { sequence: number; events: GameplayTraceEntry[] }
