import type { EnemyState } from '../../../domain/types';
import { advanceQuestProgress } from '../../../domain/quests/questRules';
import { loadAcceptedQuest, loadRoomContract, roomContentKey, saveQuest } from '../content/records';
import type { CanonicalPages } from '../pages';
import { check } from '../validation';
import { entityKey, required } from '../world/records';
import type { WorldPosition, WorldSpace } from '../world/types';

/** One origin room's reciprocal accepted contract only; never accepts offers or scans quest history. */
export async function recordBattleKills(pages: CanonicalPages, origin: WorldPosition, defeated: readonly EnemyState[], now: string) {
  if (!defeated.length) return;
  if (!await pages.get('world', roomContentKey(origin.level, origin.cell.spaceId))) {
    const space = await required<WorldSpace>(pages, entityKey(origin.level, 'space', origin.cell.spaceId));
    check(space.schema === 1 && space.level === origin.level && space.spec.id === origin.cell.spaceId
      && space.spec.kind === 'passage', 'battle origin room has no content');
    return;
  }
  const contract = await loadRoomContract(pages, origin.level, origin.cell.spaceId);
  if (!contract) return;
  const row = await loadAcceptedQuest(pages, contract);
  if (!row || row.quest.status !== 'active' || row.quest.task.objective !== 'kill') return;
  const q = row.quest;
  const matching = new Set(defeated.filter(e => e.hp === 0 && (!q.task.monsterTags?.length
    || q.task.monsterTags.some(tag => e.tags.includes(tag)))).map(e => e.id));
  const quest = advanceQuestProgress(q, q.task.progress + matching.size, now, 'event');
  if (quest !== q) await saveQuest(pages, { ...row, quest });
}
