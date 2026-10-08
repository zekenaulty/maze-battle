import { describe, expect, it } from 'vitest';
import { createNewGameState, normalizeGameState } from '../gameFactory';
import { canUseTownPortal, portalScrollCount, useTownPortal } from '../town/portal';
import { consumableCount } from './autoInventory';
import { addItemsToInventory, autoEquipBestGear, equipItem, manageAutoInventory, sellItem, setInventoryPolicy, stashItem, useConsumable, withdrawStashItem } from './inventory';
import { consumeStackItem, itemQuantity, mergeInventoryItems, stackInventoryItems } from './itemStacks';
import { ambiguousItemIds } from './itemOwnership';
import { assignWeapons, gear, inventoryGame, supply } from './__tests__/fixtures';

describe('ambiguous inventory identity boundaries', () => {
  it('preserves duplicate records and cross-container identity on repeated normalization, while stacking unique supplies', () => {
    const duplicate = supply('health-herb', 3, { id: 'collision' });
    const unique = [supply('health-herb', 4, { id: 'first' }), supply('health-herb', 5, { id: 'second' })];
    const base = inventoryGame([]);
    let game = createNewGameState({ ...base, inventory: { capacity: 1, gold: 8, items: [duplicate, ...unique] }, stash: { capacity: 0, items: [{ ...duplicate, quantity: 7 }] } });
    for (let cycle = 0; cycle < 3; cycle++) {
      game = normalizeGameState(JSON.parse(JSON.stringify(game)));
      expect(game.inventory.items).toEqual([duplicate, { ...unique[0], quantity: 9 }]);
      expect(game.stash.items).toEqual([{ ...duplicate, quantity: 7 }]);
      expect(ambiguousItemIds(game)).toEqual(new Set(['collision']));
    }
    expect(stackInventoryItems([duplicate, duplicate])).toEqual([duplicate, duplicate]);
    expect(consumeStackItem([duplicate, duplicate], duplicate.id)).toEqual([duplicate, duplicate]);
  });

  it('never turns malformed quantities into resources or loses their records during normalization', () => {
    for (const quantity of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      const invalid = supply('town-portal', quantity, { id: 'invalid' });
      expect(itemQuantity(invalid)).toBe(0);
      expect(stackInventoryItems([invalid])).toEqual([invalid]);
      const container = { capacity: 0, items: [invalid] };
      expect(mergeInventoryItems(container, []).inventory.items).toEqual([invalid]);
      expect(mergeInventoryItems({ capacity: 1, items: [] }, [invalid]).rejected).toEqual([invalid]);
      expect(mergeInventoryItems({ capacity: 0, items: [] }, [invalid], true).inventory.items).toEqual([invalid]);
    }
    const huge = supply('health-herb', Number.MAX_SAFE_INTEGER);
    expect(stackInventoryItems([huge, supply('health-herb')])).toHaveLength(2);
    const serializedInvalid = JSON.parse(JSON.stringify(supply('town-portal', Infinity)));
    expect(itemQuantity(serializedInvalid)).toBe(0);
    expect(stackInventoryItems([serializedInvalid])).toEqual([serializedInvalid]);
  });

  it('strict admission rejects a colliding ID; awarded overflow preserves and protects it', () => {
    const duplicate = supply('health-herb', 2, { id: 'collision' });
    const container = { capacity: 36, items: [duplicate] };
    expect(mergeInventoryItems(container, [duplicate])).toMatchObject({ accepted: [], rejected: [duplicate], inventory: container });
    let game = inventoryGame([gear('unique', { baseDamage: 30 })], { stash: { capacity: 0, items: [duplicate] } });
    game = addItemsToInventory(game, [duplicate], 'Award');
    expect(game.inventory.items).toContainEqual(duplicate);
    expect(game.stash.items).toEqual([duplicate]);
    expect(ambiguousItemIds(game)).toEqual(new Set(['collision']));
    expect(game.party.some((actor) => actor.equipment.weapon === 'unique')).toBe(true);
  });

  it('protects ambiguous gear without blocking unique equipment, sales or bounded town care', () => {
    const duplicate = gear('collision', { baseDamage: 500 });
    const current = ['a', 'b', 'c'].map((id) => gear(id, { baseDamage: 10 }));
    const upgrade = gear('upgrade', { baseDamage: 50 });
    const junk = gear('junk', {});
    const base = assignWeapons(inventoryGame([...current, duplicate, upgrade, junk], { mode: 'town', stash: { capacity: 96, items: [{ ...duplicate, stats: {} }] } }), ['a', 'b', 'c']);
    const game = setInventoryPolicy(base, { autoStash: false, autoRestock: false });
    const next = manageAutoInventory(game);
    expect(next.inventory.items).toContainEqual(duplicate);
    expect(next.stash.items).toEqual(game.stash.items);
    expect(next.party.some((actor) => actor.equipment.weapon === 'collision')).toBe(false);
    expect(next.party.some((actor) => actor.equipment.weapon === 'upgrade')).toBe(true);
    expect(next.inventory.items).not.toContainEqual(junk);
    expect(next.inventory.gold).toBe(10);
    expect(manageAutoInventory(next)).toBe(next);
    expect(sellItem(next, 'collision')).toBe(next);
    expect(stashItem(next, 'collision')).toBe(next);
    expect(withdrawStashItem(next, 'collision')).toBe(next);
    expect(equipItem(next, next.party[0].id, 'collision')).toBe(next);
  });

  it('pins already-equipped ambiguous IDs, but still improves other actors', () => {
    const duplicate = gear('collision', { baseDamage: 2 });
    const game = assignWeapons(inventoryGame([duplicate, { ...duplicate }, gear('unique', { baseDamage: 100 })]), ['collision']);
    const next = autoEquipBestGear(game);
    expect(next.party[0].equipment.weapon).toBe('collision');
    expect(next.party.slice(1).some((actor) => actor.equipment.weapon === 'unique')).toBe(true);
    expect(next.inventory.items).toEqual(game.inventory.items);
  });

  it('does not consume ambiguous potions or scrolls through either portal entry path', () => {
    const scroll = supply('town-portal', 2, { id: 'portal-collision' });
    const herb = supply('health-herb', 2, { id: 'herb-collision' });
    const raw = inventoryGame([scroll, herb], { stash: { capacity: 96, items: [{ ...scroll }, { ...herb }] } });
    const game = { ...raw, party: raw.party.map((actor) => ({ ...actor, hp: 1 })) };
    expect(portalScrollCount(game)).toBe(0);
    expect(consumableCount(game, 'heal')).toBe(0);
    expect(canUseTownPortal(game)).toBe(false);
    expect(useTownPortal(game)).toBe(game);
    expect(useConsumable(game, scroll.id)).toBe(game);
    expect(useConsumable(game, herb.id)).toBe(game);
    const unique = supply('town-portal', 1, { id: 'unique-portal' });
    const usable = { ...game, inventory: { ...game.inventory, items: [...game.inventory.items, unique] } };
    expect(portalScrollCount(usable)).toBe(1);
    expect(useConsumable(usable, scroll.id)).toBe(usable);
    for (const town of [useTownPortal(usable), useConsumable(usable, unique.id)]) {
      expect(town.mode).toBe('town');
      expect(town.inventory.items).toEqual(game.inventory.items);
      expect(town.stash.items).toEqual(game.stash.items);
    }
  });
});
