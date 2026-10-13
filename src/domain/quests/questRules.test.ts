import { afterEach, describe, expect, it, vi } from 'vitest';
import { chestAt, lineMaze, roomAt } from '../automation/autopilotTestFixtures';
import { createNewGameState } from '../gameFactory';
import { createGuildContract } from '../guild/contractFactory';
import { guildContractsForFloor } from '../guild/contracts';
import type { QuestState } from '../types';
import { advanceQuestProgress, claimQuest, questFromContract } from './questRules';
import { acceptGuildContract, claimGuildQuestReward, recordFetchQuestProgress, updateQuestProgress } from './quests';

const acceptedAt = '2026-01-01T00:00:00.000Z';
const now = '2026-01-02T00:00:00.000Z';
const contract = createGuildContract({ floor: 7, originRoomId: 'guild', target: { id: 'cache', kind: 'treasure', name: 'Cache' } });
const quest = questFromContract(contract, acceptedAt);
afterEach(() => vi.useRealTimers());

describe('shared single-quest transitions', () => {
  it('accepts only the supplied contract with an explicit clock and no implicit progress or payment', () => {
    expect(quest).toEqual({
      id: contract.id, source: 'guild', floor: 7, originRoomId: 'guild', targetRoomId: 'cache',
      targetRoomName: 'Cache', targetRoomKind: 'treasure', title: contract.title, description: contract.description,
      task: { ...contract.task, progress: 0 }, reward: { gold: contract.rewardGold }, status: 'active', acceptedAt,
    });
    expect(questFromContract(contract, acceptedAt)).toEqual(quest);
    expect(quest.task).not.toBe(contract.task);
    expect(claimQuest(quest, now)).toBeUndefined();
  });

  it.each(['observation', 'event'] as const)('recomputes owned item counts but retains monotonic legacy progress in %s mode', mode => {
    const partial = { ...quest, task: { ...quest.task, required: 3, progress: 2 } };
    expect(advanceQuestProgress(partial, 2, now, mode)).toBe(partial);
    const lost = advanceQuestProgress(partial, 0, now, mode);
    expect(lost).toMatchObject({ status: 'active', task: { progress: 0 } });
    expect(lost.completedAt).toBeUndefined();
    expect(partial.task.progress).toBe(2);
    const legacy = { ...partial, task: { ...partial.task, item: undefined } };
    expect(advanceQuestProgress(legacy, 0, now, mode)).toBe(legacy);
    expect(advanceQuestProgress(legacy, 2, now, mode)).toBe(legacy);
    for (const objective of ['scout', 'locate', 'kill'] as const) {
      const other = { ...legacy, task: { ...legacy.task, objective } };
      expect(advanceQuestProgress(other, 1, now, mode)).toBe(other);
      expect(advanceQuestProgress(other, 99, now, mode)).toMatchObject({ status: 'complete', task: { progress: 3 }, completedAt: now });
    }
  });

  it('keeps the observation/event distinction for already-satisfied active quests', () => {
    const ready = { ...quest, task: { ...quest.task, progress: 1 } };
    expect(advanceQuestProgress(ready, 1, now, 'event')).toBe(ready);
    expect(advanceQuestProgress(ready, 1, now)).toMatchObject({ status: 'complete', completedAt: now });
    const zeroRequired = { ...quest, task: { ...quest.task, required: 0 } };
    expect(advanceQuestProgress(zeroRequired, 0, now).status).toBe('active');
    expect(advanceQuestProgress(zeroRequired, 1, now)).toMatchObject({ status: 'complete', task: { progress: 1 } });
  });

  it('caps progress, separates completion from payment, and leaves terminal quests unchanged', () => {
    const complete = advanceQuestProgress(quest, 99, now);
    expect(complete).toEqual({ ...quest, task: { ...quest.task, progress: 1 }, status: 'complete', completedAt: now });
    expect(complete.claimedAt).toBeUndefined();
    expect(advanceQuestProgress(complete, 0, acceptedAt)).toBe(complete);
    const claim = claimQuest(complete, acceptedAt)!;
    expect(claim).toEqual({ gold: contract.rewardGold, quest: { ...complete, status: 'claimed', claimedAt: acceptedAt } });
    expect(claimQuest(claim.quest, now)).toBeUndefined();
    expect(advanceQuestProgress(claim.quest, 99, now)).toBe(claim.quest);
    expect(quest.status).toBe('active');
    expect(complete.status).toBe('complete');
    const foreign = { ...complete, source: 'other' } as unknown as QuestState;
    expect(claimQuest(foreign, now)).toBeUndefined();
  });

  it('legacy acceptance, observation, event recording and claim agree with the single-quest rules', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const hub = roomAt('hub', 'hub', 0), target = roomAt('cache', 'treasure', 2);
    const game = createNewGameState({ maze: lineMaze(4, [hub, target]), chests: [chestAt(2)] });
    const discovered = guildContractsForFloor(game)[0];
    const accepted = acceptGuildContract(game, discovered.id);
    const expected = questFromContract(discovered, now);
    expect(accepted.quests).toEqual([expected]);
    const legacy = { ...expected, task: { ...expected.task, item: undefined } };
    const opened = { ...accepted, quests: [legacy], chests: [chestAt(2, true)] };
    const observed = updateQuestProgress(opened);
    const recorded = recordFetchQuestProgress(opened, target.center);
    const complete = advanceQuestProgress(legacy, legacy.task.required, now);
    expect(observed.quests).toEqual([complete]);
    expect(recorded.quests).toEqual([complete]);
    const claim = claimQuest(complete, now)!;
    const paid = claimGuildQuestReward(observed, complete.id);
    expect(paid.quests).toEqual([claim.quest]);
    expect(paid.inventory.gold - observed.inventory.gold).toBe(claim.gold);
    expect(claimGuildQuestReward(paid, complete.id)).toBe(paid);
  });
});
