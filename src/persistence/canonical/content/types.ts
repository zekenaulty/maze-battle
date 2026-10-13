import type { GuildContract } from '../../../domain/guild/contractFactory';
import type { ChestState, QuestState } from '../../../domain/types';
import type { WorldRoleBinding } from '../world/roles';

export interface ContentPreparation {
  schema: 1;
  level: number;
  binding: WorldRoleBinding;
  nextRoom: number;
  lastRoomRecordId: string | null;
}
export interface RoomContent {
  schema: 1;
  level: number;
  spaceId: string;
  chestId: string | null;
  contractId: string | null;
}
export interface StoredChest { schema: 1; spaceId: string; chest: ChestState }
export interface StoredContract { schema: 1; contract: GuildContract; accepted: boolean }
export interface StoredQuest {
  schema: 1;
  quest: QuestState;
  // Award history outlives item ownership. It is never inferred by scanning old chests.
  award: { itemId: string; chestId: string } | null;
}
export type ContentCommand = { kind: 'open-chest'; chestId: string }
  | { kind: 'accept-quest'; contractId: string }
  | { kind: 'claim-quest'; questId: string };
