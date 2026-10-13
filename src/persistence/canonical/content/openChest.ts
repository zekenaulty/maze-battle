import { canOpenChest, rollChestLoot } from '../../../domain/items/chestRules';
import { addItemsToInventory } from '../../../domain/items/inventory';
import { ownedQuestItemCount, questItemForChest } from '../../../domain/quests/questItems';
import { advanceQuestProgress } from '../../../domain/quests/questRules';
import type { RosterState } from '../../../domain/party/roster';
import { defaultRng, type Rng } from '../../../domain/combat/rng';
import { encodeItem } from '../roster/itemValidation';
import { requireWorldAnchor } from '../world/residency';
import type { WorldPosition } from '../world/types';
import type { CanonicalPages } from '../pages';
import { loadAcceptedQuest, loadChest, loadRoomContract, saveChest, saveQuest } from './records';
import { requireWorldContent } from './preparation';

/** Exact voluntary action. Navigation/load do not call this function. */
export async function openStoredChest(pages: CanonicalPages, id: string, at: WorldPosition,
  roster: RosterState, now: string, rng: Rng = defaultRng) {
  const stored = await loadChest(pages, at.level, id), { chest } = stored;
  if (stored.spaceId !== at.cell.spaceId || !canOpenChest(roster, at.cell, chest)) return { roster, loot: [] };
  await requireWorldContent(pages, at.level); await requireWorldAnchor(pages, at);
  const contract = await loadRoomContract(pages, at.level, stored.spaceId);
  const row = contract ? await loadAcceptedQuest(pages, contract) : null;
  const collectible = row ? questItemForChest(row.quest, { floor: at.level, opened: false,
    targetEligible: row.quest.targetRoomId === stored.spaceId, ownedCount: ownedQuestItemCount(roster, row.quest), alreadyAwarded: row.award !== null }) : undefined;
  const loot = [...rollChestLoot(chest, rng), ...(collectible ? [collectible] : [])].map(encodeItem);
  let next = addItemsToInventory(roster, loot, 'Chest opened');
  if (row) {
    const quest = advanceQuestProgress(row.quest, ownedQuestItemCount(next, row.quest), now, 'event');
    if (quest !== row.quest || collectible) {
      await saveQuest(pages, { ...row, quest, award: collectible ? { itemId: collectible.id, chestId: id } : row.award });
      if (quest.status === 'complete' && row.quest.status !== 'complete') next = { ...next,
        activityLog: [`Quest complete: ${quest.title}.`, ...next.activityLog].slice(0, 12) };
    }
  }
  await saveChest(pages, { ...stored, chest: { ...chest, opened: true, loot } });
  return { roster: { ...next, updatedAt: now }, loot };
}
