import { describe, expect, it, vi } from 'vitest';
import { chestAt, lineMaze, questFor, roomAt } from './automation/autopilotTestFixtures';
import { createNewGameState, normalizeGameState } from './gameFactory';
import { openChest } from './items/chests';
import { ownedQuestItemCount } from './quests/questItems';
import { updateQuestProgress } from './quests/quests';
import type { GameState, ItemInstance, QuestItemSpec } from './types';

const room = roomAt('cache', 'treasure', 2);
const spec: QuestItemSpec = { baseId: 'guild-cache', displayName: 'Guild Cache', token: '[G]' };

function fetchGame(): GameState {
  const game = createNewGameState({ mode: 'auto-play', maze: lineMaze(5, [roomAt('hub', 'hub', 0), room], 2),
    chests: [chestAt(2)], inventory: { capacity: 0, gold: 17, items: [] }, stash: { capacity: 0, items: [] } });
  const quest = questFor(room, 'fetch');
  return { ...game, quests: [{ ...quest, task: { ...quest.task, item: { ...spec } } }] };
}

function collectible(game: GameState): ItemInstance {
  return { ...spec, id: 'quest-collectible', questId: game.quests[0].id, category: 'quest',
    rarity: 'common', itemLevel: 1, value: 0, quantity: 1 };
}

function expectPreserved(loaded: GameState, original: GameState) {
  expect(loaded.quests).toEqual(original.quests);
  expect(loaded.inventory).toEqual(original.inventory);
  expect(loaded.stash).toEqual(original.stash);
  expect(loaded.chests).toEqual(original.chests);
  expect(loaded.activityLog).toEqual(original.activityLog);
  expect(loaded.updatedAt).toBe(original.updatedAt);
}

describe('quest item normalization preservation', () => {
  it.each(['pack', 'stash', 'chest'] as const)('roundtrips a spec and %s collectible without granting progress or claiming', (location) => {
    const game = fetchGame(), item = collectible(game);
    game.chests[0] = { ...game.chests[0], opened: true, loot: [item] };
    if (location === 'pack') game.inventory.items = [item];
    if (location === 'stash') game.stash.items = [item];
    let loaded = game;
    for (let cycle = 0; cycle < 3; cycle++) {
      const stored = JSON.parse(JSON.stringify(loaded)), before = JSON.stringify(stored);
      loaded = normalizeGameState(stored);
      expectPreserved(loaded, game);
      expect(loaded.quests[0].task.item).toEqual(spec);
      expect(loaded.quests[0].task.item).not.toBe(stored.quests[0].task.item);
      expect(loaded.quests[0]).toMatchObject({ status: 'active', task: { progress: 0 } });
      expect(JSON.stringify(stored)).toBe(before);
    }
    expect(ownedQuestItemCount(loaded, loaded.quests[0])).toBe(location === 'chest' ? 0 : 1);
    expect(updateQuestProgress(loaded).quests[0].status).toBe(location === 'chest' ? 'active' : 'complete');
  });

  it('preserves an actual shared chest award through reload and cannot award it again', () => {
    const opened = openChest(fetchGame(), 'chest-2', () => 0.42);
    expect(opened.quests[0].status).toBe('complete');
    const loaded = normalizeGameState(JSON.parse(JSON.stringify(opened)));
    expectPreserved(loaded, opened);
    expect(ownedQuestItemCount(loaded, loaded.quests[0])).toBe(1);
    const rng = vi.fn(() => 0.42);
    expect(openChest(loaded, 'chest-2', rng)).toBe(loaded);
    expect(rng).not.toHaveBeenCalled();
  });

  it.each(['active', 'complete', 'claimed'] as const)('preserves explicit %s status, progress and timestamps without policy effects', (status) => {
    const game = fetchGame(), quest = game.quests[0];
    game.quests = [{ ...quest, status, task: { ...quest.task, progress: 1 },
      ...(status !== 'active' ? { completedAt: '2026-10-11T12:00:00Z' } : {}),
      ...(status === 'claimed' ? { claimedAt: '2026-10-11T12:01:00Z' } : {}) }];
    let loaded = game;
    for (let cycle = 0; cycle < 3; cycle++) {
      loaded = normalizeGameState(JSON.parse(JSON.stringify(loaded)));
      expectPreserved(loaded, game);
    }
  });

  it.each(['active', 'complete', 'claimed'] as const)('keeps legacy %s fetch tasks without an item unchanged', (status) => {
    const game = fetchGame(), legacy = questFor(room, 'fetch');
    game.quests = [{ ...legacy, status, task: { ...legacy.task, progress: status === 'active' ? 0 : 1 } }];
    game.chests[0].opened = true;
    let loaded = game;
    for (let cycle = 0; cycle < 3; cycle++) {
      loaded = normalizeGameState(JSON.parse(JSON.stringify(loaded)));
      expectPreserved(loaded, game);
      expect(loaded.quests[0].task).not.toHaveProperty('item');
    }
    const updated = updateQuestProgress(loaded);
    expect(updated.quests[0].status).toBe(status === 'active' ? 'complete' : status);
    expect(updated.inventory.gold).toBe(game.inventory.gold);
  });

  it('clones valid spec fields without rewriting identity text, including in factory overrides', () => {
    const game = fetchGame();
    game.quests[0].task.item = { baseId: ' custom-cache ', displayName: ' Custom Cache ', token: ' [C] ' };
    for (const loaded of [normalizeGameState(game), createNewGameState(game)]) {
      expectPreserved(loaded, game);
      expect(loaded.quests[0].task.item).not.toBe(game.quests[0].task.item);
    }
  });

  const malformed = [null, false, true, 0, 1, '', 'guild-cache', [], {},
    ...(['baseId', 'displayName', 'token'] as const).flatMap((key) =>
      [undefined, null, false, 1, [], {}, '', ' \t '].map((value) => ({ ...spec, [key]: value })))];

  it.each(malformed)('rejects a malformed present spec instead of downgrading it to legacy: %j', (item) => {
    const game = fetchGame();
    game.chests[0].opened = true;
    const stored = JSON.parse(JSON.stringify({ ...game, quests: [{ ...game.quests[0], task: { ...game.quests[0].task, item } }] }));
    const before = JSON.stringify(stored);
    expect(() => normalizeGameState(stored)).toThrow('Invalid quest item specification');
    expect(() => createNewGameState(stored)).toThrow('Invalid quest item specification');
    expect(JSON.stringify(stored)).toBe(before);
  });
});
