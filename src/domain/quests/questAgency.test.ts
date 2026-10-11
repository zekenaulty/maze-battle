import { describe, expect, it } from 'vitest';
import { createNewGameState, moveActive, normalizeGameState } from '../gameFactory';
import { advanceAutopilot } from '../automation/autopilot';
import { chestAt, lineMaze, questFor, roomAt } from '../automation/autopilotTestFixtures';
import { castExplorationSkill } from '../party/partyActions';
import { useTownPortal } from '../town/portal';
import { claimGuildQuestReward } from './quests';

const hub = roomAt('hub', 'hub', 0), scout = roomAt('safe', 'safe', 1);

describe('voluntary quest authority', () => {
  it.each(['manual', 'auto-play', 'waves'] as const)('creation/loading/movement do not execute %s controller policy', mode => {
    const game = createNewGameState({ mode, maze: lineMaze(5, [hub, scout]), chests: [chestAt(2)] });
    expect(game.quests).toEqual([]);
    const moved = moveActive(game, 'east', { triggerStairs: false });
    expect(moved.maze.active.column).toBe(1);
    expect(moved.quests).toEqual([]);
    expect(moved.inventory).toEqual(game.inventory);
    expect(moved.chests).toEqual(game.chests);
    const loaded = normalizeGameState(JSON.parse(JSON.stringify(moved)));
    expect(loaded.quests).toEqual([]);
    expect(loaded.inventory).toEqual(game.inventory);
    expect(loaded.updatedAt).toBe(moved.updatedAt);
    expect(loaded.activityLog).toEqual(moved.activityLog);
  });

  it('movement records an accepted scout objective without accepting others or paying its reward', () => {
    const quest = questFor(scout, 'scout');
    const game = createNewGameState({ maze: lineMaze(5, [hub, scout]), quests: [quest] });
    const moved = moveActive(game, 'east', { triggerStairs: false });
    expect(moved.quests).toHaveLength(1);
    expect(moved.quests[0]).toMatchObject({ id: quest.id, status: 'complete', task: { progress: 1 } });
    expect(moved.inventory).toEqual(game.inventory);
    const loaded = normalizeGameState(JSON.parse(JSON.stringify(moved)));
    expect(loaded.quests).toEqual(moved.quests);
    expect(loaded.inventory).toEqual(game.inventory);
    const claimed = claimGuildQuestReward(loaded, quest.id);
    expect(claimed.inventory.gold).toBe(game.inventory.gold + quest.reward.gold);
    expect(claimGuildQuestReward(claimed, quest.id)).toBe(claimed);
  });

  it('old eligible but unpaid quest states survive reload without new progress or payment', () => {
    const active = { ...questFor(scout, 'scout'), id: 'old-active' };
    const complete = { ...questFor(scout, 'scout'), id: 'old-complete', status: 'complete' as const };
    const claimed = { ...questFor(scout, 'scout'), id: 'old-claimed', status: 'claimed' as const };
    const game = createNewGameState({ mode: 'auto-play', maze: lineMaze(5, [hub, scout], 1), quests: [active, complete, claimed] });
    let loaded = game;
    for (let i = 0; i < 3; i++) {
      loaded = normalizeGameState(JSON.parse(JSON.stringify(loaded)));
      expect(loaded.quests).toEqual(game.quests);
      expect(loaded.inventory).toEqual(game.inventory);
      expect(loaded.activityLog).toEqual(game.activityLog);
      expect(loaded.updatedAt).toBe(game.updatedAt);
    }
  });

  it('Auto explicitly accepts and pays at its own decision boundary', () => {
    const game = createNewGameState({ mode: 'auto-play', randomBattles: false,
      maze: lineMaze(5, [hub, scout], 1), chests: [chestAt(3)] });
    expect(game.quests).toEqual([]);
    const next = advanceAutopilot(game, () => 0.5);
    expect(next.quests.length).toBeGreaterThan(0);
    expect(next.quests.some(quest => quest.targetRoomId === scout.id && quest.status === 'claimed')).toBe(true);
    expect(next.inventory.gold).toBeGreaterThan(game.inventory.gold);
  });

  it('portal use does not accept or claim quests as part of visiting town', () => {
    const complete = { ...questFor(scout, 'scout'), status: 'complete' as const };
    const game = createNewGameState({ maze: lineMaze(5, [hub, scout]), quests: [complete] });
    const next = useTownPortal(game);
    expect(next.mode).toBe('town');
    expect(next.quests).toEqual(game.quests);
    expect(next.inventory.gold).toBe(game.inventory.gold);
  });

  it('teleporting onto a chest is movement, not consent to loot or accept quests', () => {
    const game = createNewGameState({ maze: lineMaze(4, [hub]), chests: [chestAt(1)] });
    const mage = game.party.find(actor => actor.role === 'mage')!;
    const next = castExplorationSkill(game, mage.id, 'teleport', () => 0, 1000);
    expect(next.maze.active.column).toBe(1);
    expect(next.chests).toEqual(game.chests);
    expect(next.inventory).toEqual(game.inventory);
    expect(next.quests).toEqual([]);
    expect(next.party.find(actor => actor.id === mage.id)!.mp).toBeLessThan(mage.mp);
  });
});
