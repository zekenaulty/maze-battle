import { describe, expect, it } from 'vitest';
import { autoEquipBestGear, junkItemsForSale, sellJunkItems, setInventoryPolicy, toggleItemLock } from './inventory';
import { getGearUpgradeScore } from './gearScore';
import { evaluateLoadoutChange } from './gearEvaluation';
import { EQUIPMENT_SLOTS } from './equipment';
import { assignWeapons, gear, inventoryGame } from './__tests__/fixtures';

describe('safe equipment selection', () => {
  it('does not sacrifice one hero to improve the party total', () => {
    const game = assignWeapons(inventoryGame([
      gear('equipped', { baseDamage: 10, intellect: 30 }), gear('spare', { baseDamage: 8 }),
    ]), ['equipped']);
    const next = autoEquipBestGear(game);
    expect(next.party[0].equipment.weapon).toBe('equipped');
    next.party.forEach((actor, index) => expect(['upgrade', 'equivalent']).toContain(evaluateLoadoutChange(game.party[index], actor, next.inventory.items).decision));
    expect(next.party.slice(1).some((actor) => actor.equipment.weapon === 'spare')).toBe(true);
    expect(autoEquipBestGear(next)).toBe(next);
  });

  it('pins locked equipped items and does not assign locked spare gear', () => {
    const initial = assignWeapons(inventoryGame([
      gear('pinned', { baseDamage: 1 }, { locked: true }),
      gear('spare', { baseDamage: 10 }),
      gear('locked-spare', { baseDamage: 100 }, { locked: true }),
    ]), ['pinned']);
    const game = autoEquipBestGear(initial);
    expect(game.party[0].equipment.weapon).toBe('pinned');
    expect(game.party.some((actor) => actor.equipment.weapon === 'locked-spare')).toBe(false);
    const solo = { ...initial, party: initial.party.slice(0, 1) };
    expect(autoEquipBestGear(toggleItemLock(solo, 'pinned')).party[0].equipment.weapon).toBe('spare');
    // Once the spare belongs to someone else, unlocking cannot authorize their downgrade.
    expect(autoEquipBestGear(toggleItemLock(game, 'pinned')).party[0].equipment.weapon).toBe('pinned');
  });

  it('keeps equal-scoring assignments stable', () => {
    const game = assignWeapons(inventoryGame([gear('a', { baseDamage: 2 }), gear('b', { baseDamage: 2 }), gear('c', { baseDamage: 2 })]), ['c', 'b', 'a']);
    expect(autoEquipBestGear(game)).toBe(game);
  });

  it('preserves per-hero policy benefits and unique ownership over many inventories', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const items = Array.from({ length: 30 }, (_, i) => gear(`gear-${i}`, {
        baseDamage: (seed * (i + 3)) % 13, intellect: (seed + i * 3) % 17, vitality: (seed * 7 + i) % 11,
      }, { locked: i === 1 && seed % 2 === 0 }));
      const game = assignWeapons(inventoryGame(items), ['gear-0', 'gear-1', 'gear-2']);
      const next = autoEquipBestGear(game);
      next.party.forEach((actor, index) => expect(['upgrade', 'equivalent']).toContain(evaluateLoadoutChange(game.party[index], actor, items).decision));
      const ids = next.party.flatMap((actor) => Object.values(actor.equipment));
      expect(new Set(ids).size).toBe(ids.length);
      expect(next.inventory).toBe(game.inventory);
      expect(autoEquipBestGear(next)).toBe(next);
    }
  });

  it('bounds the full-loadout tradeoff over multiple slots and repeated passes', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const items = EQUIPMENT_SLOTS.flatMap((slot, s) => Array.from({ length: 7 }, (_, i) => gear(`${slot}-${i}`, {
        baseDamage: (seed * (i + 3) + s) % 13, intellect: (seed + i * 3 + s) % 17, vitality: (seed * 7 + i + s) % 11,
      }, { slot })));
      const base = inventoryGame(items);
      const game = { ...base, party: base.party.map((actor, i) => ({ ...actor, equipment: Object.fromEntries(EQUIPMENT_SLOTS.map((slot) => [slot, `${slot}-${i}`])) })) };
      const next = autoEquipBestGear(game);
      next.party.forEach((actor, index) => expect(['upgrade', 'equivalent']).toContain(evaluateLoadoutChange(game.party[index], actor, items).decision));
      const ids = next.party.flatMap((actor) => Object.values(actor.equipment));
      expect(new Set(ids).size).toBe(ids.length);
      const again = autoEquipBestGear(next);
      again.party.forEach((actor, index) => expect(['upgrade', 'equivalent']).toContain(evaluateLoadoutChange(next.party[index], actor, items).decision));
      expect(again).toBe(next);
    }
  });
});

describe('upgrade-aware junk', () => {
  it('sells obsolete gear across all rarities but preserves upgrades, locks and equipment', () => {
    const items = [
      ...['a', 'b', 'c'].map((id) => gear(id, { baseDamage: 10 })),
      gear('obsolete', { baseDamage: 1 }),
      gear('upgrade', { intellect: 100 }),
      gear('locked', { baseDamage: 1 }, { locked: true }),
      gear('rare', { baseDamage: 1 }, { rarity: 'rare' }),
      gear('legendary', { baseDamage: 1 }, { rarity: 'legendary' }),
      gear('power', {}, { legendaryPower: { id: 'unique', name: 'Unique', description: 'Keep' } }),
    ];
    const game = setInventoryPolicy(assignWeapons(inventoryGame(items, { mode: 'town' }), ['a', 'b', 'c']), { autoEquip: false });
    const soldIds = ['obsolete', 'rare', 'legendary', 'power'];
    expect(junkItemsForSale(game).map((item) => item.id)).toEqual(soldIds);
    const sold = sellJunkItems(game);
    expect(sold.inventory.items.map((item) => item.id)).toEqual(items.filter((item) => !soldIds.includes(item.id)).map((item) => item.id));
    expect(sold.inventory.gold).toBe(20);
    expect(sold.party).toBe(game.party);
  });

  it('does not compare against inaccessible stash gear or another hero gear', () => {
    const spare = gear('spare', { baseDamage: 2 });
    let game = assignWeapons(inventoryGame([gear('equipped', { baseDamage: 10 }), spare]), ['equipped']);
    game = { ...game, stash: { capacity: 96, items: [gear('stashed', { baseDamage: 100 })] } };
    expect(junkItemsForSale(game)).toEqual([]);
    expect(getGearUpgradeScore(spare, game.party[1], game.inventory.items)).toBeGreaterThan(0);
  });
});
