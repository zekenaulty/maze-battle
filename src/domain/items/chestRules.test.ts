import { describe, expect, it, vi } from 'vitest';
import { chestAt, lineMaze, roomAt, seededRng } from '../automation/autopilotTestFixtures';
import { createNewGameState } from '../gameFactory';
import { createGuildContract } from '../guild/contractFactory';
import { ownedQuestItemCount, questItemForChest, questItemsForChest, type QuestChestFacts } from '../quests/questItems';
import { questFromContract } from '../quests/questRules';
import type { ChestState, ItemInstance } from '../types';
import { canOpenChest, rollChestLoot } from './chestRules';
import { chestAtActivePosition, openChest } from './chests';
import { rollLoot } from './loot';
import { roster } from './roster.testSupport';

const position = { row: 12, column: 34 };
const chest: ChestState = { id: 'chest-7-cache', level: 7, position, opened: false };
const state = roster([], { mode: 'manual' });
const contract = createGuildContract({ floor: 7, originRoomId: 'hub', target: { id: 'cache', kind: 'treasure', name: 'Cache' } });
const quest = questFromContract(contract, '2026-01-01T00:00:00Z');
const facts: QuestChestFacts = { floor: 7, opened: false, targetEligible: true, ownedCount: 0, alreadyAwarded: false };
const withoutIds = (items: ItemInstance[]) => items.map(({ id: _id, ...item }) => item);

describe('shared local chest rules', () => {
  it('needs only the actual roster, local actor position and chest, with no fabricated maze/floors', () => {
    expect(canOpenChest(state, position, chest)).toBe(true);
    expect(canOpenChest(state, { ...position, row: 13 }, chest)).toBe(false);
    expect(canOpenChest(state, { ...position, column: 35 }, chest)).toBe(false);
    expect(canOpenChest(state, position, { ...chest, opened: true })).toBe(false);
    expect(canOpenChest(state, position, { ...chest, level: 8 })).toBe(false);
    expect(canOpenChest({ ...state, mode: 'town' }, position, chest)).toBe(false);
    expect(canOpenChest({ ...state, party: [] }, position, chest)).toBe(false);
    expect(canOpenChest({ ...state, party: state.party.map(actor => ({ ...actor, hp: 0 })) }, position, chest)).toBe(false);
    expect(canOpenChest({ ...state, battle: { id: 'fight', wave: 1, status: 'active', round: 1, enemies: [], log: [] } }, position, chest)).toBe(false);
    for (const mode of ['manual', 'auto-play', 'waves', 'battle'] as const) {
      expect(canOpenChest({ ...state, mode }, position, chest)).toBe(true);
    }
    expect(chest.opened).toBe(false);
    expect(state).not.toHaveProperty('maze');
    expect(state).not.toHaveProperty('floors');
  });

  it.each([1, 2, 9, 50])('retains ordinary loot and RNG consumption at level %i while allowing replay-stable IDs', level => {
    const regularRng = vi.fn(seededRng(43)), sharedRng = vi.fn(seededRng(43));
    const ordinary = rollLoot({ source: 'chest', level }, regularRng);
    const itemId = (index: number) => `award:${chest.id}:${index}`;
    const loot = rollChestLoot({ level }, sharedRng, itemId);
    expect(withoutIds(loot)).toEqual(withoutIds(ordinary));
    expect(loot.map(item => item.id)).toEqual(loot.map((_, index) => itemId(index)));
    expect(sharedRng.mock.calls).toHaveLength(regularRng.mock.calls.length);
    expect(rollChestLoot({ level }, seededRng(43), itemId)).toEqual(loot);
    expect(loot.every(item => item.category !== 'quest')).toBe(true);
    expect(rollChestLoot({ level }, seededRng(43))[0].id).not.toBe(rollChestLoot({ level }, seededRng(43))[0].id);
  });

  it('legacy target selection and opening use the local eligibility and ordinary loot rules', () => {
    const hub = roomAt('hub', 'hub', 0);
    const game = createNewGameState({ maze: lineMaze(4, [hub], 2), chests: [chestAt(2)], inventoryPolicy: { autoEquip: false } });
    const local = game.chests[0];
    expect(canOpenChest(game, game.maze.active, local)).toBe(true);
    expect(chestAtActivePosition(game)).toBe(local);
    const opened = openChest(game, local.id, seededRng(7));
    expect(withoutIds(opened.chests[0].loot!)).toEqual(withoutIds(rollChestLoot(local, seededRng(7))));
    expect(game.chests[0].opened).toBe(false);
    const rng = vi.fn(seededRng(7));
    expect(openChest(game, 'stale-id', rng)).toBe(game);
    expect(openChest({ ...game, mode: 'town' }, local.id, rng).chests[0].opened).toBe(false);
    expect(openChest(opened, local.id, rng)).toBe(opened);
    expect(rng).not.toHaveBeenCalled();
  });
});

describe('shared collectible factory', () => {
  it('uses only explicit facts, awards one stable token, and supports roster-only ownership counts', () => {
    const item = questItemForChest(quest, facts)!;
    expect(item).toEqual({ ...quest.task.item, id: `quest-item:${quest.id}`, questId: quest.id,
      category: 'quest', rarity: 'common', itemLevel: 7, value: 0, quantity: 1 });
    expect(questItemForChest(quest, facts)).toEqual(item);
    expect(ownedQuestItemCount({ inventory: { ...state.inventory, items: [item] }, stash: state.stash }, quest)).toBe(1);
    expect(ownedQuestItemCount({ inventory: state.inventory, stash: { ...state.stash, items: [item] } }, quest)).toBe(1);
    expect(quest.status).toBe('active');
    expect(quest.task.progress).toBe(0);
  });

  it.each([
    { opened: true }, { floor: 8 }, { targetEligible: false }, { ownedCount: 1 }, { alreadyAwarded: true },
  ])('rejects an ineligible fact set: %j', patch => {
    expect(questItemForChest(quest, { ...facts, ...patch })).toBeUndefined();
  });

  it('never awards terminal, non-fetch or legacy quests', () => {
    for (const status of ['complete', 'claimed'] as const) {
      expect(questItemForChest({ ...quest, status }, facts)).toBeUndefined();
    }
    expect(questItemForChest({ ...quest, task: { ...quest.task, objective: 'scout' } }, facts)).toBeUndefined();
    expect(questItemForChest({ ...quest, task: { ...quest.task, item: undefined } }, facts)).toBeUndefined();
  });

  it('legacy collection uses the same award and does not confuse history with ownership', () => {
    const room = roomAt('cache', 'treasure', 2), local = { ...chestAt(2), level: 7 };
    const game = createNewGameState({ dungeonLevel: 7, maze: lineMaze(4, [room]), chests: [local], quests: [quest] });
    const item = questItemForChest(quest, facts)!;
    expect(questItemsForChest(game, local)).toEqual([item]);
    const awarded = { ...game, chests: [...game.chests, { ...local, id: 'previous', opened: true, loot: [item] }] };
    expect(ownedQuestItemCount(awarded, quest)).toBe(0);
    expect(questItemsForChest(awarded, local)).toEqual([]);
    const owned = { ...game, stash: { ...game.stash, items: [item] } };
    expect(ownedQuestItemCount(owned, quest)).toBe(1);
    expect(questItemsForChest(owned, local)).toEqual([]);
  });
});
