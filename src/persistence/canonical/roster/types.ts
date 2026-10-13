import type { ActorState, EquipmentSlot, InventoryPolicy, ItemInstance } from '../../../domain/types';
import type { RosterState } from '../../../domain/party/roster';
import type { CanonicalPages } from '../pages';

export type RosterRead = Pick<CanonicalPages, 'get' | 'scan'>;
export type ItemOwner = { kind: 'pack' | 'stash' } | { kind: 'equipped'; actorId: string; slot: EquipmentSlot };
export interface StoredItem { schema: 1; item: ItemInstance; owner: ItemOwner; order: number }
export interface StoredActor { schema: 1; actor: ActorState }
export interface PartyHeader { schema: 1; actorIds: string[] }
export interface ContainerHeader { schema: 1; capacity: number; count: number; nextOrder: number; gold?: number }
export interface PolicyRecord { schema: 1; policy: InventoryPolicy }
export type RosterContext = Pick<RosterState, 'mode' | 'townReturnMode' | 'battle' | 'dungeonLevel' | 'updatedAt' | 'activityLog'>;
export interface RosterSnapshot {
  state: RosterState;
  rows: { party: PartyHeader; pack: ContainerHeader; stash: ContainerHeader; policy: PolicyRecord;
    actors: Map<string, StoredActor>; items: Map<string, StoredItem> };
}

// Read limits, not pack capacity. Exceeding one aborts rather than discarding stock.
export const MAX_CONTAINER_RECORDS = 256;
export const MAX_PARTY_MEMBERS = 3;
export const groupOf = (owner: ItemOwner) => owner.kind === 'stash' ? 'stash' : 'pack';
