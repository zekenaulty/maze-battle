import type { GameState, InventoryPolicy } from '../types';

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
    healthReserve: reserve(policy?.healthReserve, 3, 0, 20),
    manaReserve: reserve(policy?.manaReserve, 2, 0, 20),
    portalReserve: reserve(policy?.portalReserve, 1, 1, 5),
  };
}

export function setInventoryPolicy(game: GameState, patch: Partial<InventoryPolicy>): GameState {
  const inventoryPolicy = normalizeInventoryPolicy({ ...normalizeInventoryPolicy(game.inventoryPolicy), ...patch });
  if (JSON.stringify(game.inventoryPolicy) === JSON.stringify(inventoryPolicy)) return game;
  return { ...game, inventoryPolicy, updatedAt: new Date().toISOString() };
}

export function toggleItemLock(game: GameState, itemId: string): GameState {
  if (![...game.inventory.items, ...game.stash.items].some((item) => item.id === itemId)) return game;
  const toggle = (items: GameState['inventory']['items']) =>
    items.map((item) => item.id === itemId ? { ...item, locked: !item.locked } : item);
  return {
    ...game,
    inventory: { ...game.inventory, items: toggle(game.inventory.items) },
    stash: { ...game.stash, items: toggle(game.stash.items) },
    updatedAt: new Date().toISOString(),
  };
}

function reserve(value: number | undefined, fallback: number, min: number, max: number): number {
  return value !== undefined && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback;
}
