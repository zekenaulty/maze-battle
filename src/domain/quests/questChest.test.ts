import { describe, expect, it, vi } from 'vitest';
import { advanceAutopilot } from '../automation/autopilot';
import { chestAt, lineMaze, questFor, roomAt } from '../automation/autopilotTestFixtures';
import { createNewGameState, moveActive } from '../gameFactory';
import { guildContractsForFloor } from '../guild/contracts';
import { openChest } from '../items/chests';
import type { GameState, ItemInstance } from '../types';
import { acceptGuildContract, recordFetchQuestProgress, updateQuestProgress } from './quests';
import { ownedQuestItemCount } from './questItems';

const hub = roomAt('hub', 'hub', 0);
const treasure = { ...roomAt('cache', 'treasure', 2), columns: 2 };
const collectibles = (items: ItemInstance[]) => items.filter((item) => item.category === 'quest');

function fetchGame(): GameState {
  const game = createNewGameState({ maze: lineMaze(6, [hub, treasure], 2), randomBattles: false,
    chests: [chestAt(2), chestAt(3), chestAt(4)], inventoryPolicy: { autoEquip: false } });
  return acceptGuildContract(game, guildContractsForFloor(game)[0].id);
}

describe('shared chest fetch collectibles', () => {
  it('manual and Auto use the same award command, retaining regular loot without immediate payment', () => {
    const game = fetchGame();
    const manualRng = vi.fn(() => 0.42), autoRng = vi.fn(() => 0.42);
    const manual = openChest(game, 'chest-2', manualRng);
    const auto = advanceAutopilot({ ...game, mode: 'auto-play' }, autoRng);
    const withoutIds = (items: ItemInstance[]) => items.map(({ id: _id, ...item }) => item);
    expect(autoRng.mock.calls.length).toBe(manualRng.mock.calls.length);
    expect(withoutIds(auto.chests[0].loot!)).toEqual(withoutIds(manual.chests[0].loot!));
    expect(withoutIds(auto.inventory.items)).toEqual(withoutIds(manual.inventory.items));
    for (const next of [manual, auto]) {
      expect(next.chests[0].loot).toHaveLength(3);
      const awarded = collectibles(next.chests[0].loot!);
      expect(awarded).toEqual([{ ...game.quests[0].task.item, id: `quest-item:${game.quests[0].id}`,
        questId: game.quests[0].id, category: 'quest', rarity: 'common', itemLevel: 1, value: 0, quantity: 1 }]);
      expect(collectibles(next.inventory.items)).toEqual(awarded);
      expect(next.quests).toHaveLength(1);
      expect(next.quests[0]).toMatchObject({ status: 'complete', task: { progress: 1 } });
      expect(next.inventory.gold).toBe(game.inventory.gold);
      expect(openChest(next, 'chest-2', () => { throw new Error('reopened'); })).toBe(next);
    }
  });

  it('movement and unaccepted contracts do not materialize hidden loot or accept work', () => {
    const game = fetchGame();
    const moved = moveActive({ ...game, maze: { ...game.maze, active: { row: 0, column: 1 } } }, 'east');
    expect(moved.chests).toEqual(game.chests);
    expect(moved.chests[0].loot).toBeUndefined();
    expect(moved.inventory).toEqual(game.inventory);
    expect(moved.quests).toEqual(game.quests);
    const unaccepted = openChest({ ...game, quests: [] }, 'chest-2', () => 0.42);
    expect(unaccepted.quests).toEqual([]);
    expect(collectibles(unaccepted.chests[0].loot!)).toEqual([]);
  });

  it('rejects stale ids, remote chests, town, combat and defeated parties before rolling', () => {
    const game = fetchGame(), rng = vi.fn(() => 0.42);
    expect(openChest(game, 'stale-id', rng)).toBe(game);
    expect(openChest(game, 'chest-3', rng)).toBe(game);
    const blocked: GameState[] = [
      { ...game, mode: 'town' },
      { ...game, party: game.party.map((actor) => ({ ...actor, hp: 0 })) },
      { ...game, battle: { id: 'fight', wave: 1, status: 'active', round: 1, enemies: [], log: [] } },
    ];
    for (const state of blocked) expect(openChest(state, 'chest-2', rng)).toBe(state);
    expect(rng).not.toHaveBeenCalled();
  });

  it.each(['complete', 'claimed'] as const)('never reissues a %s quest collectible', (status) => {
    const game = fetchGame();
    game.quests[0].status = status;
    const next = openChest(game, 'chest-2', () => 0.42);
    expect(collectibles(next.chests[0].loot!)).toEqual([]);
    expect(next.quests).toEqual(game.quests);
  });

  it.each(['pack', 'stash'] as const)('counts %s ownership and suppresses a second award for an active quest', (location) => {
    const game = fetchGame(), opened = openChest(game, 'chest-2', () => 0.42);
    const item = collectibles(opened.inventory.items)[0];
    const owned = { ...game, inventory: { ...game.inventory, items: location === 'pack' ? [item] : [] },
      stash: { ...game.stash, items: location === 'stash' ? [item] : [] } };
    expect(ownedQuestItemCount(owned, game.quests[0])).toBe(1);
    expect(updateQuestProgress(owned).quests[0].status).toBe('complete');
    const next = openChest(owned, 'chest-2', () => 0.42);
    expect(collectibles(next.chests[0].loot!)).toEqual([]);
    expect(next.quests[0].status).toBe('complete');
    expect(ownedQuestItemCount(next, game.quests[0])).toBe(1);
  });

  it('does not treat opened flags or award history as ownership, or reissue a missing award', () => {
    const game = fetchGame();
    const flagsOnly = { ...game, chests: [chestAt(2, true)] };
    expect(updateQuestProgress(flagsOnly)).toBe(flagsOnly);
    expect(recordFetchQuestProgress(flagsOnly, treasure.center)).toBe(flagsOnly);
    const opened = openChest(game, 'chest-2', () => 0.42);
    const missing = { ...opened, inventory: game.inventory, quests: game.quests,
      maze: { ...opened.maze, active: { row: 0, column: 3 } } };
    const next = openChest(missing, 'chest-3', () => 0.42);
    expect(collectibles(next.chests[1].loot!)).toEqual([]);
    expect(next.quests).toEqual(game.quests);
  });

  it('requires the target room, floor and fetch objective while retaining ordinary loot', () => {
    const game = fetchGame();
    const variants = [
      { ...game, maze: { ...game.maze, active: { row: 0, column: 4 } } },
      { ...game, quests: [{ ...game.quests[0], floor: 2 }] },
      { ...game, quests: [{ ...game.quests[0], task: { ...game.quests[0].task, objective: 'kill' as const } }] },
    ];
    for (const state of variants) {
      const next = openChest(state, `chest-${state.maze.active.column}`, () => 0.42);
      const loot = next.chests.find((chest) => chest.opened)!.loot!;
      expect(loot).toHaveLength(2);
      expect(collectibles(loot)).toEqual([]);
      expect(next.quests).toEqual(state.quests);
    }
  });

  it('retains all loot and the collectible in an overfull pack', () => {
    const game = fetchGame();
    game.inventory.capacity = game.inventory.items.length;
    const next = openChest(game, 'chest-2', () => 0.42);
    expect(next.inventory.items).toHaveLength(game.inventory.items.length + 3);
    expect(ownedQuestItemCount(next, next.quests[0])).toBe(1);
    expect(next.chests[0].loot!.every((item) => next.inventory.items.some((owned) => owned.id === item.id))).toBe(true);
    expect(next.activityLog.some((line) => line.includes('Pack over capacity'))).toBe(true);
    expect(next.quests[0].status).toBe('complete');
  });

  it('legacy quests still complete from opened-room evidence and never receive collectibles', () => {
    const game = { ...fetchGame(), quests: [questFor(treasure, 'fetch')] };
    const opened = openChest(game, 'chest-2', () => 0.42);
    expect(collectibles(opened.inventory.items)).toEqual([]);
    expect(opened.quests[0]).toMatchObject({ status: 'complete', task: { progress: 1 } });
    const flagsOnly = { ...game, chests: [chestAt(2, true)] };
    expect(updateQuestProgress(flagsOnly).quests[0].status).toBe('complete');
    expect(recordFetchQuestProgress(flagsOnly, treasure.center).quests[0].status).toBe('complete');
  });
});
