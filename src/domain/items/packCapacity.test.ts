import { describe, expect, it } from 'vitest';
import type { GameState, ItemInstance } from '../types';
import { normalizeGameState } from '../gameFactory';
import { addItemsToInventory, autoEquipBestGear, buyVendorItem, equipItem, equippedPackItemIds, manageAutoInventory, packSlotUsage, setInventoryPolicy, stashItem, unequipItem, withdrawStashItem } from './inventory';
import { inventoryDiagnostics } from './inventoryDiagnostics';
import { mergeInventoryItems } from './itemStacks';
import { assignWeapons, gear, inventoryGame, supply } from './__tests__/fixtures';

function equippedGame(bag: ItemInstance[] = [], capacity = 1): GameState {
  const items = [...['a', 'b', 'c'].map((id) => gear(id, { baseDamage: 10 })), ...bag];
  return setInventoryPolicy(assignWeapons(inventoryGame(items, { mode: 'town', inventory: { capacity, gold: 100, items } }), ['a', 'b', 'c']),
    { autoEquip: false, autoSellJunk: false, autoStash: false, autoRestock: false });
}

describe('authoritative pack capacity', () => {
  it('counts bag records/stacks, not worn gear, including locked equipment', () => {
    const game = equippedGame([supply('health-herb', 20)]);
    game.inventory.items[0].locked = true;
    expect(game.inventory.items).toHaveLength(4);
    expect(equippedPackItemIds(game)).toEqual(new Set(['a', 'b', 'c']));
    expect(packSlotUsage(game)).toBe(1);
    expect(inventoryDiagnostics(game).pack).toEqual({ used: 1, capacity: 1 });
    expect(packSlotUsage(normalizeGameState(JSON.parse(JSON.stringify(game))))).toBe(1);
  });

  it('does not grant exemptions for wrong slots, missing/empty IDs, supplies, invalid quantities or ambiguous ownership', () => {
    const invalids = [
      gear('wrong-slot', {}, { slot: 'ring' }), gear('same-hero', {}), gear('shared', {}),
      gear('duplicate', {}), gear('duplicate', {}), gear('cross-container', {}),
      gear('empty-stack', {}, { quantity: 0 }), gear('multiple', {}, { quantity: 2 }),
      supply('health-herb', 1, { id: 'supply' }), gear('', {}),
    ];
    const base = inventoryGame([]);
    const game: GameState = {
      ...base, inventory: { capacity: 1, gold: 0, items: invalids },
      stash: { capacity: 1, items: [gear('cross-container', {}), gear('stash-only', {})] },
      party: [
        { ...base.party[0], equipment: { weapon: 'wrong-slot', ring: 'same-hero', amulet: 'same-hero', head: 'shared', feet: 'duplicate', body: 'supply', offhand: 'missing', hands: '' } },
        { ...base.party[1], equipment: { weapon: 'shared', ring: 'cross-container', head: 'empty-stack', hands: 'multiple', body: 'stash-only' } },
      ],
    };
    const before = JSON.stringify(game);
    expect(equippedPackItemIds(game).size).toBe(0);
    expect(packSlotUsage(game)).toBe(invalids.length);
    expect(JSON.stringify(game)).toBe(before);
    const reloaded = normalizeGameState(JSON.parse(before));
    expect(reloaded.inventory.items).toEqual(invalids);
    expect(packSlotUsage(reloaded)).toBe(invalids.length);
  });

  it.each([0, 2, -1])('does not exempt malformed equipped quantity %s even in a matching slot', (quantity) => {
    const game = assignWeapons(inventoryGame([gear('invalid', {}, { quantity })]), ['invalid']);
    expect(packSlotUsage(game)).toBe(1);
  });

  it('admits purchases and withdrawals using bag slots, but refuses a new slot at full capacity atomically', () => {
    const game = equippedGame();
    const bought = buyVendorItem(game, 'health-herb');
    expect(bought.inventory.items).toHaveLength(4);
    expect(packSlotUsage(bought)).toBe(1);
    expect(bought.inventory.gold).toBeLessThan(game.inventory.gold);
    const stacked = buyVendorItem(bought, 'health-herb');
    expect(stacked.inventory.items).toHaveLength(4);
    expect(stacked.inventory.items.at(-1)?.quantity).toBe(2);
    expect(buyVendorItem(stacked, 'mana-vial')).toBe(stacked);
    const stashGear = gear('spare', { baseDamage: 50 });
    const canWithdraw = { ...game, stash: { capacity: 96, items: [stashGear] } };
    const withdrawn = withdrawStashItem(canWithdraw, stashGear.id);
    expect(packSlotUsage(withdrawn)).toBe(1);
    expect(withdrawn.inventory.items).toEqual([...game.inventory.items, stashGear]);
    expect(withdrawn.stash.items).toEqual([]);
    const full = { ...stacked, stash: canWithdraw.stash };
    expect(withdrawStashItem(full, stashGear.id)).toBe(full);
  });

  it('keeps stash admission independent of equipment exemptions and preserves stack behavior', () => {
    const spare = gear('spare', {});
    const game = { ...equippedGame([spare]), stash: { capacity: 0, items: [] } };
    expect(stashItem(game, spare.id)).toBe(game);
    const room = { ...game, stash: { capacity: 1, items: [] } };
    const moved = stashItem(room, spare.id);
    expect(packSlotUsage(moved)).toBe(0);
    expect(moved.stash.items).toEqual([spare]);
    const merged = mergeInventoryItems(game.inventory, [supply('health-herb')], false, undefined, equippedPackItemIds(game));
    expect(merged.accepted).toEqual([]);
    expect(merged.inventory.items).toEqual(game.inventory.items);
  });

  it('retains every awarded item and reports overflow using the final equipped state', () => {
    const game = equippedGame();
    const herb = supply('health-herb');
    const looted = addItemsToInventory(game, [herb], 'Loot');
    expect(packSlotUsage(looted)).toBe(1);
    expect(looted.activityLog[0]).not.toContain('over capacity');
    const spare = gear('extra', {});
    const overflow = addItemsToInventory(looted, [spare], 'Loot');
    expect(packSlotUsage(overflow)).toBe(2);
    expect(overflow.inventory.items).toEqual([...game.inventory.items, herb, spare]);
    expect(overflow.activityLog[0]).toContain('over capacity');
    const empty = inventoryGame([], { inventory: { capacity: 0, gold: 0, items: [] } });
    const equippedLoot = addItemsToInventory(empty, [gear('usable', { baseDamage: 10 })], 'Loot');
    expect(packSlotUsage(equippedLoot)).toBe(0);
    expect(equippedLoot.inventory.items).toHaveLength(1);
    expect(equippedLoot.activityLog[0]).not.toContain('over capacity');
  });
});

describe('atomic equipment capacity changes', () => {
  it('replaces from a full bag without deleting gear, but cannot then unequip into that full bag', () => {
    const game = equippedGame([gear('replacement', { baseDamage: 15 })]);
    const next = equipItem(game, game.party[0].id, 'replacement');
    expect(next.party[0].equipment.weapon).toBe('replacement');
    expect(packSlotUsage(next)).toBe(1);
    expect(next.inventory).toBe(game.inventory);
    expect(unequipItem(next, game.party[0].id, 'weapon')).toBe(next);
    expect(equipItem(next, game.party[0].id, 'replacement')).toBe(next);
  });

  it('allows unequip into the final free slot and refuses hero transfer that would overflow', () => {
    const game = equippedGame();
    const removed = unequipItem(game, game.party[0].id, 'weapon');
    expect(removed.party[0].equipment).toEqual({});
    expect(packSlotUsage(removed)).toBe(1);
    expect(removed.inventory).toBe(game.inventory);
    const full = equippedGame([supply('town-portal')]);
    const before = JSON.stringify(full);
    expect(equipItem(full, full.party[1].id, 'a')).toBe(full);
    expect(JSON.stringify(full)).toBe(before);
    const transferred = equipItem(game, game.party[1].id, 'a');
    expect(transferred.party[0].equipment).toEqual({});
    expect(transferred.party[1].equipment.weapon).toBe('a');
    expect(packSlotUsage(transferred)).toBe(1);
    expect(transferred.inventory).toBe(game.inventory);
  });

  it('can transfer to an empty hero slot at full capacity, or reduce legacy overflow by equipping', () => {
    const game = equippedGame([supply('town-portal')]);
    const empty = { ...game, inventory: { ...game.inventory, capacity: 2 }, party: game.party.map((actor, i) => i === 1 ? { ...actor, equipment: {} } : actor) };
    expect(packSlotUsage(empty)).toBe(empty.inventory.capacity);
    const transferred = equipItem(empty, empty.party[1].id, 'a');
    expect(transferred.party[1].equipment.weapon).toBe('a');
    expect(packSlotUsage(transferred)).toBe(packSlotUsage(empty));
    const overflow = { ...transferred, inventory: { ...transferred.inventory, capacity: 1 } };
    const repaired = equipItem(overflow, overflow.party[0].id, 'b');
    expect(packSlotUsage(repaired)).toBe(1);
    expect(repaired.inventory).toBe(overflow.inventory);
    expect(unequipItem(empty, empty.party[0].id, 'weapon')).toBe(empty);
  });

  it('cannot use ambiguous IDs to create capacity by equipping them', () => {
    const duplicate = gear('duplicate', { baseDamage: 100 });
    const game = equippedGame([duplicate]);
    game.stash.items = [{ ...duplicate }];
    expect(equipItem(game, game.party[0].id, duplicate.id)).toBe(game);
    expect(packSlotUsage(game)).toBe(1);
  });

  it('auto-equipping from a full pack frees or exchanges bag slots without dropping owned items', () => {
    const game = equippedGame([gear('upgrade', { baseDamage: 100 })]);
    const next = autoEquipBestGear(game);
    expect(next.party.some((actor) => actor.equipment.weapon === 'upgrade')).toBe(true);
    expect(packSlotUsage(next)).toBe(1);
    expect(next.inventory).toBe(game.inventory);
  });

  it('does not auto-withdraw stash upgrades when old equipped gear has no bag space', () => {
    const base = equippedGame([supply('town-portal')]);
    const game = { ...base, stash: { capacity: 96, items: [gear('stash-upgrade', { baseDamage: 100 })] } };
    expect(autoEquipBestGear(game)).toBe(game);
    const room = { ...game, inventory: { ...game.inventory, capacity: 2 } };
    const next = autoEquipBestGear(room);
    expect(next.party.some((actor) => actor.equipment.weapon === 'stash-upgrade')).toBe(true);
    expect(next.stash.items).toEqual([]);
    expect(packSlotUsage(next)).toBe(2);
    expect(next.inventory.items).toHaveLength(5);
    expect(autoEquipBestGear(next)).toBe(next);
  });

  it('keeps a feasible pack upgrade in contention when higher-benefit stash gear cannot fit', () => {
    const base = equippedGame([gear('pack-upgrade', { baseDamage: 30 })]);
    const game = { ...base, stash: { capacity: 96, items: [100, 101, 102, 103].map((damage) => gear(`stash-${damage}`, { baseDamage: damage })) } };
    const next = autoEquipBestGear(game);
    expect(next.party.some((actor) => actor.equipment.weapon === 'pack-upgrade')).toBe(true);
    expect(packSlotUsage(next)).toBe(1);
    expect(next.stash).toBe(game.stash);
    expect(next.inventory).toBe(game.inventory);
  });

  it('allows direct stash equipment into an empty hero slot without using bag space', () => {
    const base = inventoryGame([], { mode: 'town', inventory: { capacity: 0, gold: 0, items: [] } });
    const item = gear('stash-upgrade', { baseDamage: 100 });
    const game = { ...base, stash: { capacity: 96, items: [item] } };
    const next = autoEquipBestGear(game);
    expect(packSlotUsage(next)).toBe(0);
    expect(next.inventory.items).toEqual([item]);
    expect(next.stash.items).toEqual([]);
  });

  it('uses a bounded cleanup follow-up to free space before a stash upgrade', () => {
    const base = equippedGame([gear('junk', {})]);
    const game = setInventoryPolicy({ ...base, stash: { capacity: 96, items: [gear('upgrade', { baseDamage: 100 })] } },
      { autoEquip: true, autoSellJunk: true });
    expect(autoEquipBestGear(game)).toBe(game);
    const next = manageAutoInventory(game);
    expect(next.party.some((actor) => actor.equipment.weapon === 'upgrade')).toBe(true);
    expect(packSlotUsage(next)).toBe(0);
    expect(next.inventory.gold).toBe(game.inventory.gold + 10);
    expect(next.stash.items).toEqual([]);
    expect(manageAutoInventory(next)).toBe(next);
  });

  it('preserves gear when capacity repair uses stash rather than sales', () => {
    const junk = gear('junk', {});
    const upgrade = gear('upgrade', { baseDamage: 100 });
    const base = equippedGame([junk]);
    const game = setInventoryPolicy({ ...base, stash: { capacity: 2, items: [upgrade] } }, { autoEquip: true, autoStash: true });
    const next = manageAutoInventory(game);
    expect(next.party.some((actor) => actor.equipment.weapon === upgrade.id)).toBe(true);
    expect(packSlotUsage(next)).toBe(0);
    expect(next.stash.items).toHaveLength(2);
    expect([...next.inventory.items, ...next.stash.items].map((item) => item.id).sort()).toEqual(['a', 'b', 'c', 'junk', 'upgrade']);
    expect(next.inventory.gold).toBe(game.inventory.gold);
    expect(manageAutoInventory(next)).toBe(next);
  });
});
