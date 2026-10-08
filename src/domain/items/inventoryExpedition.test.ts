import { describe, expect, it } from 'vitest';
import { createNewGameState, normalizeGameState } from '../gameFactory';
import { advanceAutopilot, stopAutopilot } from '../automation/autopilot';
import { chestAt, lineMaze } from '../automation/autopilotTestFixtures';
import { leaveTown, maintainTown } from '../town/town';
import { portalScrollCount, useTownPortal } from '../town/portal';
import { getActorGearScore } from './gearScore';
import { getEffectiveActor, setInventoryPolicy, useConsumable } from './inventory';
import { assignWeapons, gear, supply } from './__tests__/fixtures';
import type { GameState } from '../types';

function reload(game: GameState): GameState {
  return normalizeGameState(JSON.parse(JSON.stringify(normalizeGameState(game))));
}

describe('inventory and expedition integration', () => {
  it('retains an objective route and protected gear through loot overflow, town care and reload', () => {
    const items = [
      ...['a', 'b', 'c'].map((id) => gear(id, { baseDamage: 30 })),
      gear('locked', {}, { locked: true }), gear('rare', {}, { rarity: 'rare' }),
      gear('legendary', {}, { rarity: 'legendary' }), gear('junk', {}, { value: 100 }),
      supply('town-portal', 2),
    ];
    let game = assignWeapons(createNewGameState({
      mode: 'auto-play', randomBattles: false, maze: lineMaze(9), chests: [chestAt(1), chestAt(7)],
      inventory: { capacity: 4, gold: 0, items },
    }), ['a', 'b', 'c']);
    const beforeScores = game.party.map((actor) => getActorGearScore(actor, game.inventory.items));
    game = advanceAutopilot(game, () => 0.5, 1000);
    expect(game.chests.find((chest) => chest.id === 'chest-1')?.opened).toBe(true);
    const awarded = game.chests.find((chest) => chest.id === 'chest-1')!.loot!;
    expect(awarded.length).toBeGreaterThan(0);
    for (const item of awarded) expect(game.inventory.items.some((held) => held.id === item.id)).toBe(true);
    game = advanceAutopilot(reload(game), () => 0.5, 2000);
    const expedition = game;
    expect(expedition.autopilot?.targetId).toBe('chest:chest-7');
    expect(expedition.autopilot?.route.length).toBeGreaterThan(0);

    let town = reload(useTownPortal(expedition));
    expect(town.townReturnMode).toBe('auto-play');
    expect(portalScrollCount(town)).toBe(1);
    expect(town.autopilot).toEqual(expedition.autopilot);
    town = maintainTown(town);
    const owned = [...town.inventory.items, ...town.stash.items].map((item) => item.id);
    for (const id of ['a', 'b', 'c', 'locked', 'rare', 'legendary']) expect(owned).toContain(id);
    expect(owned).not.toContain('junk');
    expect(town.inventory.items.find((item) => item.id === 'locked')?.locked).toBe(true);
    expect(portalScrollCount(town)).toBe(1);
    town.party.forEach((actor, index) => expect(getActorGearScore(actor, town.inventory.items)).toBeGreaterThanOrEqual(beforeScores[index]));
    expect(maintainTown(town)).toBe(town);

    const returned = leaveTown(reload(town));
    expect(returned.mode).toBe('auto-play');
    expect(returned.maze.active).toEqual(expedition.maze.active);
    expect(returned.autopilot).toEqual(expedition.autopilot);
    const continued = advanceAutopilot(returned, () => 0.5, 3000);
    expect(continued.maze.active.column).toBe(expedition.maze.active.column + 1);
    expect(continued.autopilot?.targetId).toBe(expedition.autopilot?.targetId);
    expect(continued.autopilot?.route).toEqual(expedition.autopilot?.route.slice(1));
    expect(portalScrollCount(continued)).toBe(1);
  });

  it('restores effective consumable vitals during travel without changing the route or replaying consumption on reload', () => {
    const hp = supply('health-herb', 2);
    const mp = supply('mana-vial', 2);
    const item = gear('vitals', { maxHp: 20, maxMp: 20, vitality: 5, intellect: 5 }, { locked: true });
    let game = assignWeapons(createNewGameState({
      mode: 'auto-play', randomBattles: false, maze: lineMaze(8), chests: [chestAt(6)],
      inventory: { capacity: 36, gold: 0, items: [hp, mp, item] },
    }), [item.id]);
    game = advanceAutopilot(game, () => 0.5, 1000);
    const plan = game.autopilot;
    const actorId = game.party[0].id;
    game = reload(useConsumable(game, hp.id, actorId));
    expect(game.party[0].hp).toBe(getEffectiveActor(game.party[0], game.inventory).maxHp);
    expect(game.inventory.items.find((item) => item.id === hp.id)?.quantity).toBe(1);
    expect(useConsumable(game, hp.id, actorId)).toBe(game);
    game = reload(useConsumable(game, mp.id, actorId));
    expect(game.party[0].mp).toBe(25);
    expect(game.inventory.items.find((item) => item.id === mp.id)?.quantity).toBe(1);
    game = reload(useConsumable(game, mp.id, actorId));
    expect(game.party[0].mp).toBe(getEffectiveActor(game.party[0], game.inventory).maxMp);
    expect(game.inventory.items.some((item) => item.id === mp.id)).toBe(false);
    expect(game.autopilot).toEqual(plan);
    expect(advanceAutopilot(game, () => 0.5, 2000).autopilot?.route).toEqual(plan?.route.slice(1));
  });

  it('does not re-enable disabled inventory policies or autopilot after a stopped town reload', () => {
    const scroll = supply('town-portal', 2);
    const game = setInventoryPolicy(createNewGameState({
      mode: 'auto-play', randomBattles: false, maze: lineMaze(8), chests: [chestAt(6)],
      inventory: { capacity: 36, gold: 100, items: [gear('junk', {}), scroll] },
    }), { autoEquip: false, autoSellJunk: false, autoStash: false, autoRestock: false });
    const town = reload(stopAutopilot(useTownPortal(advanceAutopilot(game, () => 0.5, 1000))));
    expect(town.inventoryPolicy).toEqual(game.inventoryPolicy);
    expect(town.townReturnMode).toBe('manual');
    const maintained = maintainTown(town);
    expect(maintained.inventory).toEqual(town.inventory);
    expect(maintained.stash).toEqual(town.stash);
    const returned = leaveTown(reload(maintained));
    expect(returned.mode).toBe('manual');
    expect(advanceAutopilot(returned)).toBe(returned);
    expect(portalScrollCount(returned)).toBe(1);
  });
});
