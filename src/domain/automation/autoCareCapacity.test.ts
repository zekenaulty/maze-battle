import { describe, expect, it } from 'vitest';
import { advanceTownCare, careBeforeTravel } from './autoCare';
import { planningState } from './autopilotState';
import { consumableCount } from '../items/autoInventory';
import { manageAutoInventory, packSlotUsage, setInventoryPolicy } from '../items/inventory';
import { assignWeapons, gear, inventoryGame, supply } from '../items/__tests__/fixtures';

function travelGame() {
  const items = [...['a', 'b', 'c'].map((id) => gear(id, { baseDamage: 10 })), supply('town-portal')];
  return setInventoryPolicy(assignWeapons(inventoryGame(items, { mode: 'auto-play', inventory: { capacity: 2, gold: 100, items } }), ['a', 'b', 'c']),
    { autoEquip: false, autoSellJunk: false, autoStash: false, autoRestock: false });
}

describe('capacity-aware expedition and maintenance', () => {
  it('does not visit town or block travel because worn equipment is listed in inventory', () => {
    const game = travelGame();
    expect(game.inventory.items.length).toBeGreaterThan(game.inventory.capacity);
    expect(packSlotUsage(game)).toBe(1);
    expect(careBeforeTravel(game, () => 0.5, 1000)).toBe(game);
    const full = { ...game, inventory: { ...game.inventory, items: [...game.inventory.items, supply('health-herb')] } };
    expect(packSlotUsage(full)).toBe(2);
    const town = careBeforeTravel(full, () => 0.5, 1000);
    expect(town.mode).toBe('town');
    expect(consumableCount(town, 'townPortal')).toBe(0);
  });

  it('leaves town with spare bag space, but still blocks when actual bag slots are full', () => {
    const game = travelGame();
    const town = { ...game, mode: 'town' as const, townReturnMode: 'auto-play' as const, autopilot: { ...planningState(game), phase: 'town' as const } };
    const left = advanceTownCare(town);
    expect(left.mode).toBe('auto-play');
    expect(left.autopilot?.phase).toBe('planning');
    const full = { ...town, inventory: { ...town.inventory, items: [...town.inventory.items, supply('health-herb')] } };
    const blocked = advanceTownCare(full);
    expect(blocked.mode).toBe('town');
    expect(blocked.autopilot?.phase).toBe('blocked');
    expect(blocked.autopilot?.reason).toContain('Pack is full');
  });

  it('restocks from stash into real free slots without spending gold or overflowing the pack', () => {
    const game = travelGame();
    const herb = supply('health-herb', 2);
    const mana = supply('mana-vial', 2);
    const town = setInventoryPolicy({ ...game, mode: 'town', stash: { capacity: 96, items: [herb, mana] } },
      { autoRestock: true, healthReserve: 1, manaReserve: 1 });
    const next = manageAutoInventory(town);
    expect(consumableCount(next, 'heal')).toBe(1);
    expect(consumableCount(next, 'mana')).toBe(0);
    expect(packSlotUsage(next)).toBe(2);
    expect(next.inventory.items).toHaveLength(5);
    expect(next.inventory.gold).toBe(town.inventory.gold);
    expect(next.stash.items).toMatchObject([{ id: herb.id, quantity: 1 }, { id: mana.id, quantity: 2 }]);
    expect(manageAutoInventory(next)).toBe(next);
  });

  it('buys reserves when equipped records alone previously made the pack appear full', () => {
    const game = travelGame();
    const town = setInventoryPolicy({ ...game, mode: 'town' }, { autoRestock: true, healthReserve: 1, manaReserve: 0 });
    const next = manageAutoInventory(town);
    expect(consumableCount(next, 'heal')).toBe(1);
    expect(packSlotUsage(next)).toBe(2);
    expect(next.inventory.gold).toBeLessThan(town.inventory.gold);
    expect(manageAutoInventory(next)).toBe(next);
  });
});
