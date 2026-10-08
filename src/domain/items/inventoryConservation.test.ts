import { describe, expect, it } from 'vitest';
import { addItemsToInventory, equipItem, normalizeInventory, normalizeStash, recoverParty, sellItem, stashItem, useConsumable, withdrawStashItem } from './inventory';
import { buyVendorItem, getSellValue } from './inventoryTrade';
import { gear, inventoryGame, supply } from './__tests__/fixtures';

describe('inventory conservation and stable stacking', () => {
  it('never truncates existing pack/stash items or newly awarded overflow', () => {
    const items = Array.from({ length: 5 }, (_, i) => gear(`gear-${i}`, { baseDamage: i }));
    expect(normalizeInventory({ capacity: 1, gold: 0, items }).items).toEqual(items);
    expect(normalizeStash({ capacity: 1, items }).items).toEqual(items);
    const game = inventoryGame([], { inventory: { capacity: 1, gold: 0, items } });
    const next = addItemsToInventory(game, [gear('overflow', { baseDamage: 6 })], 'Chest');
    expect(next.inventory.items.map((item) => item.id)).toEqual([...items.map((item) => item.id), 'overflow']);
    expect(normalizeInventory(next.inventory).items).toEqual(next.inventory.items);
  });

  it('keeps the first identity, preserves resale value and separates locks and potency', () => {
    const first = supply('health-herb', 2, { id: 'first' });
    const second = { ...first, id: 'second', quantity: 3 };
    const locked = { ...first, id: 'locked', locked: true };
    const stronger = { ...first, id: 'stronger', consumableAmount: 99 };
    const pricier = { ...first, id: 'pricier', value: 999 };
    const result = normalizeInventory({ capacity: 1, items: [first, second, locked, stronger, pricier] });
    expect(result.items.map((item) => item.id)).toEqual(['first', 'locked', 'stronger']);
    expect(result.items[0].quantity).toBe(7);
    expect(getSellValue(result.items[0], 7)).toBe(getSellValue(first, 2) + getSellValue(second, 3) + getSellValue(pricier, 2));
    expect(normalizeInventory(result)).toEqual(result);
  });

  it('makes failed trades atomic and allows merges into full containers', () => {
    const herb = supply('health-herb', 3);
    let game = inventoryGame([herb], { mode: 'town', stash: { capacity: 1, items: [gear('full', {})] } });
    expect(stashItem(game, herb.id)).toBe(game);
    game = { ...game, stash: { capacity: 1, items: [{ ...herb, id: 'stash-herb', quantity: 2 }] } };
    const stashed = stashItem(game, herb.id);
    expect(stashed.inventory.items).toHaveLength(0);
    expect(stashed.stash.items).toMatchObject([{ id: 'stash-herb', quantity: 5 }]);
    const full = { ...stashed, inventory: { capacity: 0, gold: 99, items: [] } };
    expect(withdrawStashItem(full, 'stash-herb')).toBe(full);
    expect(buyVendorItem(full, 'health-herb')).toBe(full);
    const withdrawn = withdrawStashItem(stashed, 'stash-herb');
    expect(withdrawn.inventory.items[0].quantity).toBe(5);
    expect(withdrawn.stash.items).toEqual([]);
  });

  it('stacks repeated consumable purchases across floors without gold underflow', () => {
    const game = inventoryGame([], { mode: 'town', inventory: { capacity: 1, gold: 12, items: [] } });
    const bought = buyVendorItem(game, 'health-herb');
    const boughtAgain = buyVendorItem({ ...bought, dungeonLevel: 9 }, 'health-herb');
    expect(boughtAgain.inventory.items).toMatchObject([{ id: bought.inventory.items[0].id, quantity: 2 }]);
    expect(boughtAgain.inventory.gold).toBe(0);
    expect(buyVendorItem(boughtAgain, 'health-herb')).toBe(boughtAgain);
  });

  it('requires town for trades and preserves locked/equipped items during stashing', () => {
    const item = gear('locked', { baseDamage: 1 }, { locked: true });
    const game = inventoryGame([item], { mode: 'town' });
    expect(stashItem(game, item.id)).toBe(game);
    expect(sellItem(game, item.id)).toBe(game);
    const unlocked = inventoryGame([{ ...item, locked: false }]);
    expect(stashItem(unlocked, item.id)).toBe(unlocked);
    expect(buyVendorItem(unlocked, 'health-herb')).toBe(unlocked);
    const equipped = equipItem({ ...unlocked, mode: 'town' }, unlocked.party[0].id, item.id);
    expect(stashItem(equipped, item.id)).toBe(equipped);
  });
});

describe('effective consumable restoration', () => {
  it('restores HP and MP to equipment-adjusted maxima, without wasting full-target items', () => {
    const ring = gear('ring', { maxHp: 30, maxMp: 30, vitality: 5, intellect: 5 }, { slot: 'ring' });
    const herb = supply('health-herb', 2);
    const mana = supply('mana-vial', 2);
    let game = inventoryGame([ring, herb, mana]);
    game = equipItem(game, game.party[0].id, ring.id);
    const actorId = game.party[0].id;
    game = useConsumable(game, herb.id, actorId);
    expect(game.party[0].hp).toBe(game.party[0].maxHp + 35);
    game = useConsumable(game, herb.id, actorId);
    expect(game.party[0].hp).toBe(game.party[0].maxHp + 40);
    game = useConsumable(game, mana.id, actorId);
    expect(game.party[0].mp).toBe(25);
    game = useConsumable(game, mana.id, actorId);
    expect(game.party[0].mp).toBe(40);
    const rested = recoverParty(game);
    expect(rested.party[0].hp).toBe(rested.party[0].maxHp + 40);
    expect(rested.party[0].mp).toBe(40);
    expect(recoverParty(rested)).toBe(rested);
  });

  it('does not consume for full, dead, nonexistent or locked targets/items', () => {
    const herb = supply('health-herb', 2);
    const game = inventoryGame([herb]);
    expect(useConsumable(game, herb.id, game.party[0].id)).toBe(game);
    expect(useConsumable(game, herb.id, 'missing')).toBe(game);
    const dead = { ...game, party: game.party.map((actor) => ({ ...actor, hp: 0 })) };
    expect(useConsumable(dead, herb.id)).toBe(dead);
    const locked = { ...dead, inventory: { ...dead.inventory, items: [{ ...herb, locked: true }] } };
    expect(useConsumable(locked, herb.id)).toBe(locked);
  });

  it('selects a living depleted target when no target is supplied', () => {
    const herb = supply('health-herb', 2);
    const game = inventoryGame([herb]);
    const hurt = { ...game, party: game.party.map((actor, i) => i === 2 ? { ...actor, hp: 1 } : actor) };
    const next = useConsumable(hurt, herb.id);
    expect(next.party[2].hp).toBe(36);
    expect(next.inventory.items[0].quantity).toBe(1);
  });
});
