import { describe, expect, it } from 'vitest';
import { createNewGameState } from '../gameFactory';
import type { ItemInstance } from '../types';
import { createItemInstance, rollDropCount } from './loot';
import { autoEquipBestGear, equipItem, sellItem, sellJunkItems, stashItem, useConsumable, withdrawStashItem } from './inventory';
import { openChestAtActivePosition } from './chests';
import { getItemBreakdownLines, getItemTotalStats } from './itemDetails';
import { evaluateLoadoutChange } from './gearEvaluation';

describe('item loot and inventory', () => {
  it('rolls drop counts by source', () => {
    expect(rollDropCount('battle', () => 0.1)).toBe(0);
    expect(rollDropCount('battle', () => 0.9)).toBe(2);
    expect(rollDropCount('chest', () => 0.9)).toBe(3);
  });

  it('rolls legendary equipment with affixes and a power', () => {
    const item = createItemInstance('iron-sword', 5, 'legendary', () => 0.99);

    expect(item.rarity).toBe('legendary');
    expect(item.slot).toBe('weapon');
    expect(item.affixes?.length).toBeGreaterThan(0);
    expect(item.legendaryPower).toBeDefined();
  });

  it('adds legendary power stats to item totals, including normalized saved powers', () => {
    const item: ItemInstance = {
      id: 'legendary-buckler-test',
      baseId: 'buckler',
      displayName: 'Legendary Buckler',
      token: '[]',
      category: 'equipment',
      rarity: 'legendary',
      itemLevel: 6,
      value: 100,
      slot: 'offhand',
      stats: { vitality: 3, maxHp: 5 },
      affixes: [
        { id: 'edge', name: 'Edge', stats: { baseDamage: 2 } },
        { id: 'guarding', name: 'Guarding', stats: { maxHp: 8 } },
        { id: 'wolf', name: 'Wolf', stats: { strength: 2, baseDamage: 1 } },
        { id: 'bear', name: 'Bear', stats: { vitality: 2, maxHp: 4 } },
      ],
      legendaryPower: { id: 'old-king', name: 'Old King', description: 'A forgotten ruler still lends strength.' },
    };

    expect(getItemTotalStats(item)).toMatchObject({
      baseDamage: 3,
      strength: 4,
      vitality: 6,
      maxHp: 17,
    });
    expect(getItemBreakdownLines(item)).toContain('Old King: +2 Strength, +1 Vitality. A forgotten ruler still lends strength.');
  });

  it('equips an inventory item onto one character slot', () => {
    const item = createItemInstance('iron-sword', 1, 'common', () => 0.5);
    const game = createNewGameState({
      inventory: {
        capacity: 10,
        gold: 0,
        items: [item],
      },
    });

    const next = equipItem(game, game.party[0].id, item.id);

    expect(next.party[0].equipment.weapon).toBe(item.id);
  });

  it('uses a town portal consumable', () => {
    const portal = createItemInstance('town-portal', 1, 'common', () => 0.5);
    const game = createNewGameState({
      inventory: {
        capacity: 10,
        gold: 0,
        items: [portal],
      },
    });

    const next = useConsumable(game, portal.id, game.party[0].id);

    expect(next.mode).toBe('town');
    expect(next.inventory.items).toHaveLength(0);
  });

  it('stacks consumables and consumes one item from a stack', () => {
    const firstHerb = createItemInstance('health-herb', 1, 'common', () => 0.5);
    const secondHerb = createItemInstance('health-herb', 1, 'common', () => 0.5);
    const game = createNewGameState({
      inventory: {
        capacity: 10,
        gold: 0,
        items: [firstHerb, secondHerb],
      },
      party: createNewGameState().party.map((actor, index) => (index === 0 ? { ...actor, hp: 1 } : actor)),
    });

    expect(game.inventory.items).toHaveLength(1);
    expect(game.inventory.items[0].quantity).toBe(2);

    const next = useConsumable(game, game.inventory.items[0].id, game.party[0].id);

    expect(next.inventory.items).toHaveLength(1);
    expect(next.inventory.items[0].quantity).toBe(1);
    expect(next.party[0].hp).toBe(36);
  });

  it('assigns gear by actual complete-loadout benefits, not role labels', () => {
    const sword = createItemInstance('iron-sword', 2, 'common', () => 0.5);
    const wand = createItemInstance('oak-wand', 2, 'common', () => 0.5);
    const game = createNewGameState({
      inventory: {
        capacity: 10,
        gold: 0,
        items: [sword, wand],
      },
    });

    const equipped = autoEquipBestGear(game);

    const utility = equipped.party.reduce((sum, actor, i) => sum + evaluateLoadoutChange(game.party[i], actor, game.inventory.items).benefit, 0);
    for (let swordOwner = 0; swordOwner < 3; swordOwner++) {
      for (let wandOwner = 0; wandOwner < 3; wandOwner++) {
        if (swordOwner === wandOwner) continue;
        const alternate = game.party.map((actor, i) => ({ ...actor, equipment: i === swordOwner ? { weapon: sword.id } : i === wandOwner ? { weapon: wand.id } : {} }));
        const alternateUtility = alternate.reduce((sum, actor, i) => sum + evaluateLoadoutChange(game.party[i], actor, game.inventory.items).benefit, 0);
        expect(utility).toBeGreaterThanOrEqual(alternateUtility - 1e-9);
      }
    }
    expect(equipped.party.flatMap((actor) => Object.values(actor.equipment)).sort()).toEqual([sword.id, wand.id].sort());
  });

  it('requires unequipping before a town sale', () => {
    const item: ItemInstance = {
      id: 'sell-test-sword',
      baseId: 'iron-sword',
      displayName: 'Odd Sword',
      token: '!',
      category: 'equipment',
      rarity: 'magic',
      itemLevel: 2,
      value: 101,
      slot: 'weapon',
      stats: { baseDamage: 5 },
    };
    const game = createNewGameState({
      mode: 'town',
      inventory: {
        capacity: 10,
        gold: 5,
        items: [item],
      },
    });
    const equipped = {
      ...game,
      party: game.party.map((actor, index) => (index === 0 ? { ...actor, equipment: { ...actor.equipment, weapon: item.id } } : actor)),
    };

    expect(sellItem(equipped, item.id)).toBe(equipped);
    const sold = sellItem(game, item.id);

    expect(sold.inventory.gold).toBe(56);
    expect(sold.inventory.items).toHaveLength(0);
    expect(sold.party[0].equipment.weapon).toBeUndefined();
    expect(sold.activityLog[0]).toBe('Sold ! Odd Sword for 51g.');
  });

  it('does not sell items outside town', () => {
    const item = createItemInstance('iron-sword', 1, 'common', () => 0.5);
    const game = createNewGameState({
      mode: 'manual',
      inventory: {
        capacity: 10,
        gold: 0,
        items: [item],
      },
    });

    expect(sellItem(game, item.id)).toBe(game);
  });

  it('stashes items and sells unequipped junk in town', () => {
    const stashSword = createItemInstance('rusty-sword', 1, 'common', () => 0.5);
    const junkCharm: ItemInstance = {
      id: 'junk-charm',
      baseId: 'junk-charm',
      displayName: 'Cracked Charm',
      token: '?',
      category: 'equipment',
      rarity: 'common',
      itemLevel: 1,
      value: 10,
      slot: 'ring',
      stats: {},
    };
    const game = createNewGameState({
      mode: 'town',
      inventory: {
        capacity: 10,
        gold: 0,
        items: [stashSword, junkCharm],
      },
    });

    const stashed = stashItem(game, stashSword.id);
    const withdrawn = withdrawStashItem(stashed, stashSword.id);
    const sold = sellJunkItems(withdrawn);

    expect(stashed.inventory.items.some((item) => item.id === stashSword.id)).toBe(false);
    expect(stashed.stash.items).toHaveLength(1);
    expect(withdrawn.stash.items).toHaveLength(0);
    expect(withdrawn.inventory.items.some((item) => item.id === stashSword.id)).toBe(true);
    expect(sold.inventory.items.every((item) => item.id !== junkCharm.id)).toBe(true);
    expect(sold.inventory.gold).toBeGreaterThan(withdrawn.inventory.gold);
  });

  it('opens a chest once and adds loot to inventory', () => {
    const game = createNewGameState({
      maze: {
        rows: 1,
        columns: 2,
        start: { row: 0, column: 0 },
        end: { row: 0, column: 1 },
        active: { row: 0, column: 0 },
        visited: [{ row: 0, column: 0 }],
        cells: [
          { row: 0, column: 0, links: ['east'] },
          { row: 0, column: 1, links: ['west'] },
        ],
      },
      chests: [{ id: 'chest-test', level: 1, position: { row: 0, column: 0 }, opened: false }],
      inventory: { capacity: 10, gold: 0, items: [] },
    });

    const opened = openChestAtActivePosition(game, () => 0.9);
    const reopened = openChestAtActivePosition(opened, () => 0.9);

    expect(opened.chests[0].opened).toBe(true);
    expect(opened.inventory.items.length).toBeGreaterThan(0);
    expect(reopened.inventory.items).toHaveLength(opened.inventory.items.length);
  });
});
