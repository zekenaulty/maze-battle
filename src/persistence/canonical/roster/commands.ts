import type { EquipmentSlot, InventoryPolicy } from '../../../domain/types';
import type { RosterState } from '../../../domain/party/roster';
import { autoEquipBestGear, equipItem, unequipItem, useConsumable, sellItem, sellJunkItems, stashItem,
  withdrawStashItem, toggleItemLock, setInventoryPolicy } from '../../../domain/items/inventory';
import { EQUIPMENT_SLOTS } from '../../../domain/items/equipment';
import { buyFromVendor, leaveTown, maintainTown, useInn, useTownPortal } from '../../../domain/town/town';
import { check, jsonBytes } from '../validation';
import { fields, id, natural } from './codec';

export type RosterCommand = { kind: 'equip'; actorId: string; itemId: string }
  | { kind: 'unequip'; actorId: string; slot: EquipmentSlot }
  | { kind: 'use'; itemId: string; actorId?: string }
  | { kind: 'sell'; itemId: string; amount: number }
  | { kind: 'stash' | 'withdraw' | 'lock'; itemId: string }
  | { kind: 'buy'; vendor: 'blacksmith' | 'alchemist'; baseId: string }
  | { kind: 'policy'; patch: Partial<InventoryPolicy> }
  | { kind: 'portal' | 'leave-town' | 'rest' | 'auto-equip' | 'sell-junk' | 'maintain-town' };

export function rosterCommand(value: unknown): RosterCommand {
  jsonBytes(value, 16 * 1024);
  const k = (value as { kind?: unknown } | null)?.kind;
  const shapes: Record<string, [string, string?]> = {
    equip: ['kind actorId itemId'], unequip: ['kind actorId slot'], use: ['kind itemId', 'actorId'],
    sell: ['kind itemId amount'], stash: ['kind itemId'], withdraw: ['kind itemId'], lock: ['kind itemId'],
    buy: ['kind vendor baseId'], policy: ['kind patch'], portal: ['kind'], 'leave-town': ['kind'], rest: ['kind'],
    'auto-equip': ['kind'], 'sell-junk': ['kind'], 'maintain-town': ['kind'],
  };
  check(typeof k === 'string' && Object.hasOwn(shapes, k), 'unsupported roster command');
  const row = fields(value, ...shapes[k]);
  for (const key of ['actorId', 'itemId', 'baseId']) if (row[key] !== undefined) id(row[key]);
  if (k === 'sell') natural(row.amount, 1);
  if (k === 'unequip') check(EQUIPMENT_SLOTS.includes(row.slot as never), 'invalid equipment slot');
  if (k === 'buy') check(row.vendor === 'blacksmith' || row.vendor === 'alchemist', 'invalid vendor');
  if (k === 'policy') {
    const patch = fields(row.patch, '', 'autoEquip autoSellJunk autoStash autoRestock healthReserve manaReserve portalReserve');
    for (const [key, value] of Object.entries(patch)) {
      if (key.startsWith('auto')) check(typeof value === 'boolean', 'invalid policy flag');
      else { natural(value, key === 'portalReserve' ? 1 : 0); check(value <= (key === 'portalReserve' ? 5 : 20), 'invalid policy reserve'); }
    }
  }
  return structuredClone(value) as RosterCommand;
}

/** Explicit host-selected command; loading, navigation and observation never call this policy. */
export function applyRosterCommand(state: RosterState, command: RosterCommand): RosterState {
  switch (command.kind) {
    case 'equip': return equipItem(state, command.actorId, command.itemId);
    case 'unequip': return unequipItem(state, command.actorId, command.slot);
    case 'use': return useConsumable(state, command.itemId, command.actorId);
    case 'sell': return sellItem(state, command.itemId, command.amount);
    case 'stash': return stashItem(state, command.itemId);
    case 'withdraw': return withdrawStashItem(state, command.itemId);
    case 'lock': return toggleItemLock(state, command.itemId);
    case 'buy': return buyFromVendor(state, command.vendor, command.baseId);
    case 'policy': return setInventoryPolicy(state, command.patch);
    case 'portal': return useTownPortal(state);
    case 'leave-town': return leaveTown(state);
    case 'rest': return useInn(state);
    case 'auto-equip': return autoEquipBestGear(state);
    case 'sell-junk': return sellJunkItems(state);
    case 'maintain-town': return maintainTown(state);
  }
}
