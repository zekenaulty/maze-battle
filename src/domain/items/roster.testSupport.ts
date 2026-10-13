import { createInitialParty } from '../party/factory';
import type { RosterState } from '../party/roster';
import type { ItemInstance } from '../types';
import { normalizeInventoryPolicy } from './inventoryPolicy';
import { createVendorItem } from './loot';

export function roster(items: ItemInstance[] = [], overrides: Partial<RosterState> = {}): RosterState {
  return {
    party: createInitialParty('roster'),
    inventory: { capacity: 36, gold: 100, items },
    stash: { capacity: 96, items: [] },
    inventoryPolicy: normalizeInventoryPolicy({ autoEquip: false, autoSellJunk: false, autoStash: false, autoRestock: false }),
    mode: 'town',
    dungeonLevel: 7,
    updatedAt: '2026-01-01T00:00:00.000Z',
    activityLog: [],
    ...overrides,
  };
}

export function rosterItem(baseId: string, extra: Partial<ItemInstance> = {}): ItemInstance {
  return { ...createVendorItem(baseId), id: baseId, quantity: 1, ...extra };
}
