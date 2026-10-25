import type { QuestStatus } from '../../../domain/types';
import { readCanonical } from '../read';
import { fields } from '../roster/codec';
import type { CanonicalSnapshot } from '../types';
import { check, integer, jsonBytes } from '../validation';
import { same } from '../world/records';
import { readAcceptedQuest } from './acceptedQueries';
import { loadAcceptedQuest, loadContract, questIndexes } from './records';

export const QUEST_JOURNAL_PAGE_SIZE = 8;
const prefix = 'quests/floor/';
export interface QuestJournalCursor { snapshot: CanonicalSnapshot; after: string }
export interface QuestJournalEntry {
  id: string; title: string; floor: number; status: QuestStatus;
  progress: number; required: number; noun: string; rewardGold: number;
}
export interface QuestJournalPage { entries: QuestJournalEntry[]; next?: QuestJournalCursor }

function index(value: unknown) {
  check(typeof value === 'string', 'invalid journal cursor');
  const match = /^quests\/floor\/([1-9][0-9]*)\/(active|complete|claimed)\/([A-Za-z0-9_.:-]{1,128})$/.exec(value);
  check(match && integer(Number(match[1]), 1), 'invalid journal cursor');
  return `quest/${match[3]}`;
}

/** Explicit player journal, not an agent grant or ambient game projection. */
export async function readCanonicalQuestJournal(snapshot: CanonicalSnapshot, cursor?: QuestJournalCursor, signal?: AbortSignal) {
  const pinned = structuredClone(snapshot);
  let after: string | undefined;
  if (cursor !== undefined) {
    jsonBytes(cursor, 12 * 1024); const c = fields(cursor, 'snapshot after');
    check(same(c.snapshot, pinned), 'stale or foreign journal cursor');
    index(c.after); after = cursor.after;
  }
  return readCanonical(async (pages): Promise<QuestJournalPage> => {
    if (after !== undefined) {
      const key = index(after), record = await pages.get('world', key);
      check(record && record.key === key, 'journal cursor is not an accepted entry');
      const entry = await readAcceptedQuest(pages, { key, id: record.id });
      check(questIndexes(entry.quest)[0] === after, 'journal cursor is not an accepted entry');
    }
    const page = await pages.scan('world', prefix, after, QUEST_JOURNAL_PAGE_SIZE);
    check(Array.isArray(page.rows) && page.rows.length <= QUEST_JOURNAL_PAGE_SIZE, 'oversized journal page');
    const entries: QuestJournalEntry[] = [];
    let previous = after;
    for (const candidate of page.rows) {
      const entry = await readAcceptedQuest(pages, { key: candidate.key, id: candidate.id });
      check(same(candidate, entry.record), 'journal index record changed');
      const accepted = await loadAcceptedQuest(pages, await loadContract(pages, entry.quest.quest.id));
      check(accepted && same(accepted, entry.quest), 'journal acceptance evidence changed');
      const q = accepted.quest, at = questIndexes(accepted)[0];
      check(previous === undefined || at > previous, 'unordered journal page');
      previous = at;
      entries.push({ id: q.id, title: q.title, floor: q.floor, status: q.status,
        progress: q.task.progress, required: q.task.required, noun: q.task.noun, rewardGold: q.reward.gold });
    }
    if (page.next !== undefined) {
      index(page.next);
      check(entries.length === QUEST_JOURNAL_PAGE_SIZE && page.next === previous, 'invalid journal continuation');
    }
    return { entries, ...(page.next === undefined ? {} : { next: { snapshot: pinned, after: page.next } }) };
  }, { snapshot: pinned, signal });
}
