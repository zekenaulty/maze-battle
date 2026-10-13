import type { GuildContract } from '../guild/contractFactory';
import type { QuestState } from '../types';

export function questFromContract(contract: GuildContract, now: string): QuestState {
  return {
    id: contract.id,
    source: 'guild',
    floor: contract.floor,
    originRoomId: contract.originRoomId,
    targetRoomId: contract.targetRoomId,
    targetRoomName: contract.targetRoomName,
    targetRoomKind: contract.targetRoomKind,
    title: contract.title,
    description: contract.description,
    task: { ...contract.task, progress: 0 },
    reward: { gold: contract.rewardGold },
    status: 'active',
    acceptedAt: now,
  };
}

/** Absolute progress from caller-qualified evidence, not an increment or an acceptance action. */
export function advanceQuestProgress(quest: QuestState, progress: number, now: string, mode: 'observation' | 'event' = 'observation'): QuestState {
  if (quest.status !== 'active') return quest;
  const itemFetch = quest.task.objective === 'fetch' && quest.task.item;
  const unchanged = itemFetch ? progress === quest.task.progress : progress <= quest.task.progress;
  // Observation can reconcile an already-satisfied active quest; events require a change.
  if (unchanged && (mode === 'event' || progress < quest.task.required)) return quest;
  const required = Math.max(1, quest.task.required);
  const next: QuestState = { ...quest, task: { ...quest.task, progress: Math.min(required, progress) } };
  return next.task.progress >= required ? { ...next, status: 'complete', completedAt: now } : next;
}

/** The caller applies the returned payment once, alongside the claimed quest. */
export function claimQuest(quest: QuestState, now: string): { quest: QuestState; gold: number } | undefined {
  if (quest.source !== 'guild' || quest.status !== 'complete') return undefined;
  return { quest: { ...quest, status: 'claimed', claimedAt: now }, gold: quest.reward.gold };
}
