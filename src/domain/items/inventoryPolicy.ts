import type { InventoryPolicy } from '../types';
import type { RosterState } from '../party/roster';
import { ambiguousItemIds } from './itemOwnership';

export const INVENTORY_RESERVE_BOUNDS = Object.freeze({
  healthReserve: Object.freeze({ min: 0, max: 20 }),
  manaReserve: Object.freeze({ min: 0, max: 20 }),
  portalReserve: Object.freeze({ min: 1, max: 5 }),
});

export const DEFAULT_INVENTORY_POLICY: Readonly<InventoryPolicy> = Object.freeze({
  autoEquip: true,
  autoSellJunk: true,
  autoStash: true,
  autoRestock: true,
  healthReserve: 3,
  manaReserve: 2,
  portalReserve: 1,
});

export function normalizeInventoryPolicy(policy?: Partial<InventoryPolicy>): InventoryPolicy {
  const boolean = (key: 'autoEquip' | 'autoSellJunk' | 'autoStash' | 'autoRestock') =>
    typeof policy?.[key] === 'boolean' ? policy[key] : DEFAULT_INVENTORY_POLICY[key];
  return {
    autoEquip: boolean('autoEquip'),
    autoSellJunk: boolean('autoSellJunk'),
    autoStash: boolean('autoStash'),
    autoRestock: boolean('autoRestock'),
    healthReserve: reserve(policy?.healthReserve, 'healthReserve'),
    manaReserve: reserve(policy?.manaReserve, 'manaReserve'),
    portalReserve: reserve(policy?.portalReserve, 'portalReserve'),
  };
}

export function setInventoryPolicy<T extends RosterState>(game: T, patch: Partial<InventoryPolicy>): T {
  const inventoryPolicy = normalizeInventoryPolicy({ ...normalizeInventoryPolicy(game.inventoryPolicy), ...patch });
  if (JSON.stringify(game.inventoryPolicy) === JSON.stringify(inventoryPolicy)) return game;
  return { ...game, inventoryPolicy, updatedAt: new Date().toISOString() };
}

export function toggleItemLock<T extends Pick<RosterState, 'inventory' | 'stash' | 'updatedAt'>>(game: T, itemId: string): T {
  if (ambiguousItemIds(game).has(itemId)) return game;
  if (![...game.inventory.items, ...game.stash.items].some((item) => item.id === itemId)) return game;
  const toggle = (items: RosterState['inventory']['items']) =>
    items.map((item) => item.id === itemId ? { ...item, locked: !item.locked } : item);
  return {
    ...game,
    inventory: { ...game.inventory, items: toggle(game.inventory.items) },
    stash: { ...game.stash, items: toggle(game.stash.items) },
    updatedAt: new Date().toISOString(),
  };
}

function reserve(value: number | undefined, key: keyof typeof INVENTORY_RESERVE_BOUNDS): number {
  const { min, max } = INVENTORY_RESERVE_BOUNDS[key];
  return value !== undefined && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : DEFAULT_INVENTORY_POLICY[key];
}
