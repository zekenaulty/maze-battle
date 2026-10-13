import { describe, expect, expectTypeOf, it } from 'vitest';
import type { GameState } from '../types';
import { useTownPortal } from '../town/portal';
import { consumableCount } from './autoInventory';
import {
  addItemsToInventory, autoEquipBestGear, buyVendorItem, equipItem, getSellValue, manageAutoInventory,
  packSlotUsage, recoverParty, sellItem, sellJunkItems, setInventoryPolicy, stashItem, toggleItemLock,
  unequipItem, useConsumable, withdrawStashItem,
} from './inventory';
import { roster, rosterItem } from './roster.testSupport';

describe('roster-only inventory commands', () => {
  it('equips and removes gear with the existing pack capacity guards', () => {
    const sword = rosterItem('iron-sword');
    const game = roster([sword]);
    const equipped = equipItem(game, game.party[0].id, sword.id);
    expect(equipped.party[0].equipment.weapon).toBe(sword.id);
    expect(packSlotUsage(equipped)).toBe(0);
    expect(equipped.inventory).toBe(game.inventory);
    expect(unequipItem(equipped, game.party[0].id, 'weapon').party[0].equipment).toEqual({});
    const full = { ...equipped, inventory: { ...equipped.inventory, capacity: 0 } };
    expect(unequipItem(full, game.party[0].id, 'weapon')).toBe(full);
    expect(sellItem(equipped, sword.id)).toBe(equipped);
    expect(stashItem(equipped, sword.id)).toBe(equipped);
    expect(game.party[0].equipment).toEqual({});
  });

  it('sells partial stacks and moves stock between pack and stash without losing value', () => {
    const herb = rosterItem('health-herb', { quantity: 4 });
    const game = roster([herb]);
    const sold = sellItem(game, herb.id, 2);
    expect(sold.inventory.gold).toBe(game.inventory.gold + getSellValue(herb, 2));
    expect(sold.inventory.items).toMatchObject([{ id: herb.id, quantity: 2 }]);
    const stashed = stashItem(sold, herb.id);
    expect(stashed.inventory.items).toEqual([]);
    expect(stashed.stash.items).toEqual(sold.inventory.items);
    const withdrawn = withdrawStashItem(stashed, herb.id);
    expect(withdrawn.inventory).toEqual(sold.inventory);
    expect(withdrawn.stash.items).toEqual([]);
    const locked = toggleItemLock(withdrawn, herb.id);
    expect(sellItem(locked, herb.id)).toBe(locked);
    expect(stashItem(locked, herb.id)).toBe(locked);
    expect(useConsumable(locked, herb.id)).toBe(locked);
    expect(sellItem(game, herb.id, 5)).toBe(game);
    const outside = roster([herb], { mode: 'manual' });
    expect(sellItem(outside, herb.id)).toBe(outside);
    expect(stashItem(outside, herb.id)).toBe(outside);
  });

  it('heals a wounded actor using one charge and rejects full-health or duplicate stock', () => {
    const herb = rosterItem('health-herb', { quantity: 2 });
    const game = roster([herb]);
    game.party[0].hp = 1;
    const healed = useConsumable(game, herb.id, game.party[0].id);
    expect(healed.party[0].hp).toBe(36);
    expect(healed.inventory.items[0].quantity).toBe(1);
    expect(game.party[0].hp).toBe(1);
    const rested = recoverParty(healed);
    expect(rested.party[0].hp).toBe(110);
    expect(useConsumable(rested, herb.id)).toBe(rested);
    const ambiguous = { ...game, stash: { ...game.stash, items: [{ ...herb }] } };
    expect(useConsumable(ambiguous, herb.id)).toBe(ambiguous);
    expect(sellItem(ambiguous, herb.id)).toBe(ambiguous);
    expect(stashItem(ambiguous, herb.id)).toBe(ambiguous);
  });

  it('runs bounded auto-equip, selling, reserve transfers and restocking without maze data', () => {
    const sword = rosterItem('iron-sword', { stats: { baseDamage: 100 } });
    const junk = rosterItem('rusty-sword', { stats: {} });
    const portals = rosterItem('town-portal', { quantity: 4 });
    const herbs = rosterItem('health-herb', { quantity: 8 });
    const game = roster([portals, junk], {
      inventoryPolicy: undefined, stash: { capacity: 96, items: [sword, herbs] },
    });
    const next = manageAutoInventory(game);
    expect(next.party.some(actor => actor.equipment.weapon === sword.id)).toBe(true);
    expect(next.inventory.items.some(item => item.id === sword.id)).toBe(true);
    expect(next.inventory.items.some(item => item.id === junk.id)).toBe(false);
    expect(consumableCount(next, 'townPortal')).toBe(1);
    expect(consumableCount(next, 'heal')).toBe(3);
    expect(consumableCount(next, 'mana')).toBe(2);
    expect(next.stash.items.find(item => item.baseId === 'health-herb')?.quantity).toBe(5);
    expect(next.stash.items.find(item => item.baseId === 'town-portal')?.quantity).toBe(3);
    expect(next.inventory.gold).toBe(100 + getSellValue(junk) - 16);
    expect(manageAutoInventory(next)).toBe(next);
    expect(next).not.toHaveProperty('maze');
    expect(next).not.toHaveProperty('floors');
  });

  it('preserves unrelated plain-state fields and generic result types across all reducers', () => {
    const sword = rosterItem('iron-sword');
    const herb = rosterItem('health-herb', { quantity: 3 });
    const portal = rosterItem('town-portal', { quantity: 2 });
    const game = {
      ...roster([sword, herb, portal], { stash: { capacity: 96, items: [rosterItem('mana-vial')] } }),
      sessionId: 'session', metadata: { revision: 3 },
    };
    game.party[0].hp = 1;
    const before = structuredClone(game);
    const equipped = equipItem(game, game.party[0].id, sword.id);
    const results = [
      addItemsToInventory(game, [rosterItem('buckler')], 'Loot'), equipped,
      unequipItem(equipped, game.party[0].id, 'weapon'), autoEquipBestGear(game),
      sellItem(game, herb.id), sellJunkItems(game), stashItem(game, herb.id),
      withdrawStashItem(game, 'mana-vial'), buyVendorItem(game, 'health-herb'),
      useConsumable(game, herb.id), recoverParty(game), toggleItemLock(game, herb.id),
      setInventoryPolicy(game, { autoEquip: true }), manageAutoInventory(game),
      useTownPortal({ ...game, mode: 'auto-play' as GameState['mode'] }),
    ];
    for (const next of results) {
      expectTypeOf(next).toEqualTypeOf<typeof game>();
      expect(next.sessionId).toBe(game.sessionId);
      expect(next.metadata).toBe(game.metadata);
      expect(next).not.toHaveProperty('maze');
      expect(next).not.toHaveProperty('floors');
    }
    expect(game).toEqual(before);
    expect(equipItem(game, 'missing', sword.id)).toBe(game);
    expectTypeOf<ReturnType<typeof equipItem<GameState>>>().toEqualTypeOf<GameState>();
    expectTypeOf<ReturnType<typeof manageAutoInventory<GameState>>>().toEqualTypeOf<GameState>();
    expectTypeOf<ReturnType<typeof useTownPortal<GameState>>>().toEqualTypeOf<GameState>();
  });
});
