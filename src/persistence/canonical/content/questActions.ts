import { advanceQuestProgress, claimQuest, questFromContract } from '../../../domain/quests/questRules';
import { ownedQuestItemCount } from '../../../domain/quests/questItems';
import type { RosterState } from '../../../domain/party/roster';
import type { CanonicalPages } from '../pages';
import { check } from '../validation';
import { requireWorldAnchor, loadWorldRoom } from '../world/residency';
import type { WorldPosition } from '../world/types';
import { loadAcceptedQuest, loadChest, loadContract, loadRoomContent, loadRoomContract, saveContract, saveQuest } from './records';
import { requireWorldContent } from './preparation';
import type { StoredQuest } from './types';

export async function acceptQuest(pages: CanonicalPages, contractId: string, at: WorldPosition, roster: RosterState, now: string) {
  const contract = await loadContract(pages, contractId), existing = await loadAcceptedQuest(pages, contract);
  if (existing || contract.contract.floor !== at.level) return roster;
  await requireWorldContent(pages, at.level);
  if (contract.contract.objective === 'fetch') {
    const target = await loadRoomContent(pages, at.level, contract.contract.targetRoomId);
    check(target.chestId, 'fetch contract has no chest');
    if ((await loadChest(pages, at.level, target.chestId)).chest.opened) return roster;
  }
  let quest = questFromContract(contract.contract, now);
  if (quest.task.objective === 'fetch' && quest.task.item) quest = advanceQuestProgress(quest, ownedQuestItemCount(roster, quest), now);
  if (roster.mode !== 'town' && at.cell.spaceId === quest.targetRoomId && ['scout', 'locate'].includes(quest.task.objective)) {
    await requireWorldAnchor(pages, at); quest = advanceQuestProgress(quest, quest.task.required, now);
  }
  await saveContract(pages, { ...contract, accepted: true });
  await saveQuest(pages, { schema: 1, quest, award: null });
  return { ...roster, updatedAt: now, activityLog: [
    ...(quest.status === 'complete' ? [`Quest complete: ${quest.title}.`] : []),
    `Accepted quest: ${quest.title}.`, ...roster.activityLog].slice(0, 12) };
}

export async function claimReward(pages: CanonicalPages, questId: string, roster: RosterState, now: string) {
  const contract = await loadContract(pages, questId), row = await loadAcceptedQuest(pages, contract);
  if (!row) return roster;
  const claim = claimQuest(row.quest, now); if (!claim) return roster;
  await saveQuest(pages, { ...row, quest: claim.quest });
  return { ...roster, inventory: { ...roster.inventory, gold: roster.inventory.gold + claim.gold }, updatedAt: now,
    activityLog: [`Claimed ${claim.gold}g for ${row.quest.title}.`, ...roster.activityLog].slice(0, 12) };
}

/** Caller supplies an actual committed-move destination, never a remembered or engine-only room. */
export async function recordRoomQuestVisit(pages: CanonicalPages, at: WorldPosition, now: string): Promise<StoredQuest | null> {
  await requireWorldContent(pages, at.level); await requireWorldAnchor(pages, at);
  if ((await loadWorldRoom(pages, at.level, at.cell.spaceId)).space.spec.kind === 'passage') return null;
  const contract = await loadRoomContract(pages, at.level, at.cell.spaceId);
  if (!contract) return null;
  const row = await loadAcceptedQuest(pages, contract);
  if (!row || !['scout', 'locate'].includes(row.quest.task.objective)) return null;
  const quest = advanceQuestProgress(row.quest, row.quest.task.required, now);
  if (quest === row.quest) return null;
  const next = { ...row, quest }; await saveQuest(pages, next); return next;
}
