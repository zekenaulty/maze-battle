import { describe, expect, it } from 'vitest';
import { addItemsToInventory, manageAutoInventory, normalizeInventoryPolicy, setInventoryPolicy, toggleItemLock } from './inventory';
import { consumableCount } from './autoInventory';
import { maintainTown } from '../town/town';
import { assignWeapons, gear, inventoryGame, supply } from './__tests__/fixtures';

describe('inventory policies and bounded town care', () => {
  it('defaults to useful automation and normalizes reserves to finite bounds', () => {
    expect(normalizeInventoryPolicy()).toEqual({ autoEquip: true, autoSellJunk: true, autoStash: true, autoRestock: true, healthReserve: 3, manaReserve: 2, portalReserve: 1 });
    expect(normalizeInventoryPolicy({ healthReserve: Infinity, manaReserve: -2, portalReserve: 0 })).toMatchObject({ healthReserve: 3, manaReserve: 0, portalReserve: 1 });
    expect(normalizeInventoryPolicy({ healthReserve: 999, manaReserve: 99, portalReserve: 99 })).toMatchObject({ healthReserve: 20, manaReserve: 20, portalReserve: 5 });
    expect(normalizeInventoryPolicy({ healthReserve: 2.9 })).toMatchObject({ healthReserve: 2 });
  });

  it('patches without overwriting unrelated policy fields and survives JSON state storage', () => {
    let game = setInventoryPolicy(inventoryGame(), { autoEquip: false, healthReserve: 7 });
    game = setInventoryPolicy(game, { autoStash: false });
    expect(game.inventoryPolicy).toMatchObject({ autoEquip: false, healthReserve: 7, autoStash: false, autoSellJunk: true });
    expect(setInventoryPolicy(game, {})).toBe(game);
    const restored = JSON.parse(JSON.stringify(game));
    expect(normalizeInventoryPolicy(restored.inventoryPolicy)).toEqual(game.inventoryPolicy);
  });

  it('honors disabled auto-equip during loot grants and explicit disabled town policies', () => {
    const game = setInventoryPolicy(inventoryGame(), { autoEquip: false, autoSellJunk: false, autoStash: false, autoRestock: false });
    const looted = addItemsToInventory(game, [gear('upgrade', { baseDamage: 100 })], 'Test');
    expect(looted.party).toEqual(game.party);
    const town = { ...looted, mode: 'town' as const };
    expect(manageAutoInventory(town)).toBe(town);
  });

  it('never sells, stashes or buys outside town', () => {
    const game = setInventoryPolicy(inventoryGame([gear('junk', {}), supply('health-herb', 10)]), { autoEquip: false });
    const next = manageAutoInventory(game);
    expect(next).toBe(game);
    expect(maintainTown(game)).toBe(game);
  });

  it('sells obsolete rares too, then funds escape and supplies with finite gold', () => {
    const items = [
      ...['a', 'b', 'c'].map((id) => gear(id, { baseDamage: 10 })),
      gear('junk', { baseDamage: 1 }, { value: 100 }),
      gear('valuable', { baseDamage: 1 }, { rarity: 'rare' }),
      gear('locked', {}, { locked: true }),
    ];
    const game = assignWeapons(inventoryGame(items, { mode: 'town' }), ['a', 'b', 'c']);
    const next = maintainTown(game);
    expect(next.stash.items).toEqual([]);
    expect(next.inventory.items.some((item) => item.id === 'valuable')).toBe(false);
    expect(next.inventory.items.some((item) => item.id === 'junk')).toBe(false);
    expect(next.inventory.items.some((item) => item.id === 'locked')).toBe(true);
    expect(next.party.map((actor) => actor.equipment.weapon)).toEqual(['a', 'b', 'c']);
    expect(consumableCount(next, 'townPortal')).toBe(1);
    expect(consumableCount(next, 'heal')).toBe(3);
    expect(consumableCount(next, 'mana')).toBe(2);
    expect(next.inventory.gold).toBe(7);
    expect(maintainTown(next)).toBe(next);
  });

  it('withdraws only the reserve deficit before buying and preserves split quantities/IDs', () => {
    const portal = supply('town-portal', 1);
    const herbs = supply('health-herb', 10);
    const mana = supply('mana-vial', 6);
    const game = inventoryGame([portal], {
      mode: 'town', stash: { capacity: 96, items: [herbs, mana] },
      inventory: { capacity: 36, gold: 100, items: [portal] },
    });
    const next = manageAutoInventory(game);
    expect(consumableCount(next, 'heal')).toBe(3);
    expect(consumableCount(next, 'mana')).toBe(2);
    expect(next.stash.items).toMatchObject([{ id: herbs.id, quantity: 7 }, { id: mana.id, quantity: 4 }]);
    expect(next.inventory.gold).toBe(100);
    const allIds = [...next.inventory.items, ...next.stash.items].map((item) => item.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(manageAutoInventory(next)).toBe(next);
  });

  it('stashes only excess stock and never the final available portal', () => {
    const game = setInventoryPolicy(inventoryGame([supply('town-portal', 5), supply('health-herb', 10)], { mode: 'town' }), { autoRestock: false });
    const next = manageAutoInventory(game);
    expect(consumableCount(next, 'townPortal')).toBe(1);
    expect(consumableCount(next, 'heal')).toBe(3);
    expect(next.stash.items.map((item) => item.quantity)).toEqual([4, 7]);
    expect(manageAutoInventory(next)).toBe(next);
  });

  it('fails full-stash and full-pack maintenance without losing items or money', () => {
    const portal = supply('town-portal', 1);
    const extra = supply('health-herb', 10);
    const game = inventoryGame([], {
      mode: 'town', inventory: { capacity: 2, gold: 100, items: [portal, extra] },
      stash: { capacity: 0, items: [] },
    });
    const next = manageAutoInventory(game);
    expect(next.inventory).toEqual(game.inventory);
    expect(next.stash).toEqual(game.stash);
    expect(manageAutoInventory(next)).toBe(next);
  });

  it('prioritizes portal purchases and does not drain gold when a portal is unaffordable', () => {
    const poor = inventoryGame([], { mode: 'town', inventory: { capacity: 3, gold: 10, items: [] } });
    expect(manageAutoInventory(poor).inventory).toEqual(poor.inventory);
    const funded = { ...poor, inventory: { ...poor.inventory, gold: 20 } };
    const next = manageAutoInventory(funded);
    expect(consumableCount(next, 'townPortal')).toBe(1);
    expect(consumableCount(next, 'heal')).toBe(1);
    expect(consumableCount(next, 'mana')).toBe(0);
    expect(next.inventory.gold).toBe(0);
    expect(manageAutoInventory(next)).toBe(next);
  });

  it('bounds high-reserve purchase work and protects locked stash supplies', () => {
    const locked = supply('town-portal', 10, { locked: true });
    const game = setInventoryPolicy(inventoryGame([], {
      mode: 'town', inventory: { capacity: 36, gold: 1000, items: [] }, stash: { capacity: 96, items: [locked] },
    }), { healthReserve: 10000, manaReserve: 10000, portalReserve: 10000 });
    const next = manageAutoInventory(game);
    expect(consumableCount(next, 'townPortal')).toBe(5);
    expect(consumableCount(next, 'heal')).toBe(20);
    expect(consumableCount(next, 'mana')).toBe(20);
    expect(next.inventory.gold).toBe(650);
    expect(next.stash.items).toEqual([locked]);
    expect(next.activityLog.length).toBeLessThanOrEqual(12);
    expect(manageAutoInventory(next)).toBe(next);
    expect(toggleItemLock(next, locked.id).stash.items[0].locked).toBe(false);
  });
});
