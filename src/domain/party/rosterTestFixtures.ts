import { createInitialInventory, createInitialStash } from '../items/inventory';
import { DEFAULT_INVENTORY_POLICY } from '../items/inventoryPolicy';
import { createInitialParty } from './factory';
import type { RosterState } from './roster';

export function rosterFixture(overrides: Partial<RosterState> = {}): RosterState {
  return {
    party: createInitialParty('roster-test'), inventory: createInitialInventory(), stash: createInitialStash(),
    inventoryPolicy: { ...DEFAULT_INVENTORY_POLICY }, mode: 'manual', dungeonLevel: 1,
    updatedAt: '2026-10-13T12:00:00.000Z', activityLog: [], ...overrides,
  };
}
