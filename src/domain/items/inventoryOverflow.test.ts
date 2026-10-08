import { describe, expect, it } from 'vitest';
import type { ItemInstance, ItemRarity } from '../types';
import { normalizeGameState } from '../gameFactory';
import { maintainTown } from '../town/town';
import { autoEquipBestGear, getSellValue, junkItemsForSale, manageAutoInventory, sellItem, sellJunkItems, setInventoryPolicy } from './inventory';
import { consumableCount } from './autoInventory';
import { getActorGearScore } from './gearScore';
import { itemQuantity } from './itemStacks';
import { assignWeapons, gear, inventoryGame, supply } from './__tests__/fixtures';

function questItem(id: string): ItemInstance {
  // Saves may contain a future quest category before this branch's shared types do.
  return JSON.parse(JSON.stringify({ ...gear(id, { baseDamage: 10000 }, { value: 10000 }), category: 'quest' }));
}

function obsoleteItems(prefix: string, count: number): ItemInstance[] {
  const rarities: ItemRarity[] = ['common', 'magic', 'rare', 'legendary'];
  return Array.from({ length: count }, (_, index) => gear(`${prefix}-${index}`, { baseDamage: 1 }, {
    rarity: rarities[index % rarities.length], value: index + 1, quantity: index === 0 ? 4 : 1,
    legendaryPower: index % 4 === 3 ? { id: 'relic', name: 'Relic', description: 'Obsolete power', stats: { maxHp: 1 } } : undefined,
  }));
}

describe('town overflow repair and stash sales', () => {
  it('repairs a 229/36 pack and overfull stash, equips stash upgrades first, and credits every sale exactly once', () => {
    const equipped = ['old-a', 'old-b', 'old-c'].map((id) => gear(id, { baseDamage: 10 }));
    const packJunk = obsoleteItems('pack', 222);
    const packProtected = [gear('pack-lock', { baseDamage: 1000 }, { locked: true }), questItem('pack-quest'), supply('health-herb', 5), supply('town-portal', 2)];
    const stashJunk = obsoleteItems('stash', 120);
    const upgrades = [100, 99, 98].map((damage, index) => gear(`stash-upgrade-${index}`, { baseDamage: damage }, { rarity: 'legendary' }));
    const stashProtected = [gear('stash-lock', { baseDamage: 2000 }, { locked: true }), questItem('stash-quest'), supply('mana-vial', 7)];
    let game = setInventoryPolicy(assignWeapons(inventoryGame([], {
      mode: 'town', inventory: { capacity: 36, gold: 13, items: [...equipped, ...packJunk, ...packProtected] },
      stash: { capacity: 96, items: [...stashJunk, ...upgrades, ...stashProtected] },
    }), equipped.map((item) => item.id)), { autoStash: false, autoRestock: false });
    expect(game.inventory.items).toHaveLength(229);
    game = normalizeGameState(JSON.parse(JSON.stringify(game)));
    const scores = game.party.map((actor) => getActorGearScore(actor, game.inventory.items));
    const expectedGold = 13 + [...equipped, ...packJunk, ...stashJunk].reduce((sum, item) => sum + getSellValue(item) * itemQuantity(item), 0);

    const next = maintainTown(game);
    expect(next.inventory.items).toHaveLength(7);
    expect(next.inventory.items.map((item) => item.id).sort()).toEqual([...packProtected, ...upgrades].map((item) => item.id).sort());
    expect(next.stash.items).toEqual(stashProtected);
    expect(next.inventory.gold).toBe(expectedGold);
    expect(new Set(next.party.map((actor) => actor.equipment.weapon))).toEqual(new Set(upgrades.map((item) => item.id)));
    next.party.forEach((actor, index) => expect(getActorGearScore(actor, next.inventory.items)).toBeGreaterThanOrEqual(scores[index]));
    expect(maintainTown(next)).toBe(next);
    const reloaded = normalizeGameState(JSON.parse(JSON.stringify(next)));
    expect(maintainTown(reloaded)).toBe(reloaded);
    expect(reloaded.inventory.gold).toBe(expectedGold);

    const defaultCare = maintainTown(setInventoryPolicy(game, { autoStash: true, autoRestock: true }));
    expect(defaultCare.inventory.items).toHaveLength(8);
    expect(defaultCare.inventory.gold).toBe(expectedGold);
    expect(consumableCount(defaultCare, 'heal')).toBe(3);
    expect(consumableCount(defaultCare, 'mana')).toBe(2);
    expect(consumableCount(defaultCare, 'townPortal')).toBe(1);
    expect(maintainTown(defaultCare)).toBe(defaultCare);
  });

  it('retains actual upgrades in both containers when auto-equip is explicitly off', () => {
    const current = ['a', 'b', 'c'].map((id) => gear(id, { baseDamage: 10 }));
    const upgrade = gear('pack-upgrade', { baseDamage: 20 });
    const mageUpgrade = gear('stash-mage-upgrade', { intellect: 100 }, { rarity: 'rare' });
    const packJunk = gear('pack-junk', { baseDamage: 1 }, { rarity: 'legendary' });
    const stashJunk = gear('stash-junk', { baseDamage: 1 }, { rarity: 'legendary' });
    const game = setInventoryPolicy(assignWeapons(inventoryGame([...current, upgrade, packJunk], {
      mode: 'town', stash: { capacity: 0, items: [mageUpgrade, stashJunk] },
    }), current.map((item) => item.id)), { autoEquip: false, autoStash: false, autoRestock: false });
    expect(junkItemsForSale(game, 'pack')).toEqual([packJunk]);
    expect(junkItemsForSale(game, 'stash')).toEqual([stashJunk]);
    expect(junkItemsForSale(game)).toEqual([packJunk, stashJunk]);
    const next = manageAutoInventory(game);
    expect(next.party).toBe(game.party);
    expect(next.inventory.items).toEqual([...current, upgrade]);
    expect(next.stash.items).toEqual([mageUpgrade]);
    expect(next.inventory.gold).toBe(getSellValue(packJunk) + getSellValue(stashJunk));
    expect(manageAutoInventory(next)).toBe(next);
  });

  it('never sells, equips or auto-stashes quest/non-equipment entries or mislabeled supplies', () => {
    const protectedItems = [questItem('quest'), gear('currency', { baseDamage: 5000 }, { category: 'currency' }),
      gear('supply', { baseDamage: 5000 }, { consumableEffect: 'heal', consumableAmount: 35 }), supply('town-portal', 1)];
    const stashProtected = protectedItems.map((item) => ({ ...item, id: `stash-${item.id}` }));
    const game = setInventoryPolicy(inventoryGame(protectedItems, { mode: 'town', stash: { capacity: 96, items: stashProtected } }), { autoRestock: false });
    const next = manageAutoInventory(game);
    expect(junkItemsForSale(next)).toEqual([]);
    expect(next.inventory.items).toEqual(game.inventory.items);
    expect(next.stash.items).toEqual(game.stash.items);
    expect(next.party.map((actor) => actor.equipment)).toEqual([{}, {}, {}]);
    expect(next.inventory.gold).toBe(game.inventory.gold);
    expect(sellItem(next, 'quest')).toBe(next);
    expect(sellItem(next, 'currency')).toBe(next);
  });

  it('does not sell when policy disables sales or access stash upgrades outside town', () => {
    const junk = gear('junk', {});
    const stashUpgrade = gear('upgrade', { baseDamage: 100 });
    const game = setInventoryPolicy(inventoryGame([junk], { stash: { capacity: 96, items: [stashUpgrade] } }), { autoSellJunk: false, autoStash: false, autoRestock: false });
    expect(autoEquipBestGear(game)).toBe(game);
    expect(sellJunkItems(game)).toBe(game);
    expect(manageAutoInventory(game)).toBe(game);
    const town = manageAutoInventory({ ...game, mode: 'town' });
    expect(town.inventory.items).toEqual([junk, stashUpgrade]);
    expect(town.inventory.gold).toBe(0);
    expect(town.stash.items).toEqual([]);
  });

  it('repairs via the explicit sell-junk action too, without sacrificing another hero', () => {
    const equipped = gear('equipped', { baseDamage: 10, intellect: 30 });
    const spare = gear('spare', { baseDamage: 8 });
    const game = assignWeapons(inventoryGame([equipped], { mode: 'town', stash: { capacity: 96, items: [spare, gear('junk', {})] } }), [equipped.id]);
    const next = sellJunkItems(game);
    expect(next.party[0].equipment.weapon).toBe(equipped.id);
    expect(next.party.slice(1).some((actor) => actor.equipment.weapon === spare.id)).toBe(true);
    expect(next.inventory.items.map((item) => item.id)).toEqual([equipped.id, spare.id]);
    expect(next.stash.items).toEqual([]);
    expect(next.inventory.gold).toBe(5);
    expect(sellJunkItems(next)).toBe(next);
  });

  it('keeps invalid-price equipment instead of deleting it without a valid sale', () => {
    const invalid = gear('invalid-price', {}, { value: NaN });
    const game = inventoryGame([invalid], { mode: 'town', stash: { capacity: 96, items: [gear('negative-price', {}, { value: -4 })] } });
    expect(sellJunkItems(game)).toBe(game);
    const invalidGold = { ...game, inventory: { ...game.inventory, gold: Infinity, items: [gear('junk', {})] } };
    expect(sellJunkItems(invalidGold)).toBe(invalidGold);
  });
});
