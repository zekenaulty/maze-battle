import type { QuestState } from '../../../domain/types';
import type { AgenticaObservation } from '../contracts';
import type { CanonicalQuery } from '../../../persistence/canonical/read';
import type { CanonicalSnapshot } from '../../../persistence/canonical/types';
import type { WorldRead } from '../../../persistence/canonical/world/types';
import { listAcceptedQuests, readAcceptedQuest } from '../../../persistence/canonical/content/acceptedQueries';
import { gameCheckpoint } from '../../../persistence/canonical/game/checkpoint';
import { readPublication } from '../../../persistence/canonical/agentica/publication';
import { loadOriginalAction } from '../../../persistence/canonical/agentica/actions.original';
import { equal, snapshotJson, snapshotPrepared } from '../../../persistence/canonical/agentica/validation';
import type { PreparedAction } from '../../../persistence/canonical/agentica/types';
import { questArgs, questHandle, type QuestQueryArgs, type QuestQueryProof } from '../../../persistence/canonical/agentica/quest.proof';
import { check, integer, jsonBytes } from '../../../persistence/canonical/validation';
import { captureBinding, type ActionBinding } from './actionContract';
import { MAX_OBSERVATION_BYTES } from './types';
import { questSelection, QuestQueryRefusal } from './questSelection';

type QuestPages = Pick<CanonicalQuery, 'get' | 'scan' | 'savedSnapshot' | 'sourceReceipt'>;
/** The journal reader has no access to geometry, target content, loot awards or inventory. */
function acceptedPages(pages: QuestPages, level: number): WorldRead {
  let reads = 0, bytes = 0;
  const charge = <T>(value: T) => {
    bytes += value === undefined ? 0 : jsonBytes(value, 128 * 1024);
    check(bytes <= 128 * 1024 && ++reads <= 32, 'accepted quest read budget exhausted'); return value;
  };
  return {
    async get(area, key) {
      check(area === 'world' && /^(quest|contract)\//.test(key), 'quest context cannot read hidden content');
      return charge(await pages.get(area, key));
    },
    async scan(area, prefix, after, count) {
      check(area === 'world' && ['active', 'complete', 'claimed'].some(status => prefix === `quests/floor/${level}/${status}/`)
        && integer(count, 1) && count <= 4, 'unbounded accepted quest query');
      return charge(await pages.scan(area, prefix, after, count));
    },
  };
}
function publicQuest(q: QuestState, target: string, detail: boolean) {
  const task = { objective: q.task.objective, noun: q.task.noun, required: q.task.required, progress: q.task.progress,
    ...(detail && q.task.item ? { itemName: q.task.item.displayName } : {}),
    ...(detail && q.task.monsterTags ? { monsterTags: [...q.task.monsterTags] } : {}) };
  return { target, title: q.title, status: q.status, task, reward: { gold: q.reward.gold },
    ...(detail ? { description: q.description, targetName: q.targetRoomName, acceptedAt: q.acceptedAt,
      ...(q.completedAt ? { completedAt: q.completedAt } : {}), ...(q.claimedAt ? { claimedAt: q.claimedAt } : {}) } : {}) };
}
function fits(value: AgenticaObservation) {
  try { jsonBytes(value, MAX_OBSERVATION_BYTES); return true; } catch { return false; }
}
/** An explicit snapshot-scoped journal read. It does not look at or refresh the dungeon. */
export async function queryQuests(pages: QuestPages, snapshot: CanonicalSnapshot, binding: ActionBinding,
  identity: PreparedAction, args: QuestQueryArgs): Promise<{ observation: AgenticaObservation; query: QuestQueryProof }> {
  snapshot = snapshotJson(snapshot, 8192); binding = captureBinding(binding); identity = snapshotPrepared(identity); args = questArgs(args);
  const publication = await readPublication(pages, binding.publication), retained = publication.snapshot;
  check(snapshot.generation === retained.generation && snapshot.gameId === retained.gameId && snapshot.revision >= retained.revision
    && equal(snapshot.checkpoint, retained.checkpoint) && equal({ world: snapshot.roots.world, knowledge: snapshot.roots.knowledge }, retained.roots),
  'quest context differs from publication');
  const original = await loadOriginalAction(pages, identity);
  check(original && equal(original.original.publication, binding.publication), 'quest query original changed');
  const { receipt } = await pages.sourceReceipt(publication.sourceAttemptId);
  const level = gameCheckpoint(retained.checkpoint).position.level, reader = acceptedPages(pages, level);
  const selection = await questSelection(pages, binding, args);
  const header = { observationId: binding.publication.id, revision: publication.wireRevision, observedAt: receipt.committedAt };
  const handle = (index: number | 'next') => questHandle(binding.publication, original.reference, index);
  if (args.scope === 'quest') {
    check(selection.selected, 'missing accepted quest selection');
    const row = await readAcceptedQuest(reader, selection.selected), q = row.quest.quest;
    check(q.floor === level, 'foreign accepted quest detail');
    const observation = { ...header, data: { scope: 'quest', floor: level, quest: publicQuest(q, handle(0), true) } };
    if (!fits(observation)) throw new QuestQueryRefusal('This quest detail exceeds the bounded observation size.');
    return { observation, query: { schema: 1, publication: binding.publication, scope: 'quest', level, status: q.status,
      rows: [{ key: row.record.key, id: row.record.id }], after: null, next: null } };
  }
  const page = await listAcceptedQuests(reader, level, args.status, selection.after, 4), rows: QuestQueryProof['rows'] = [], quests = [];
  let next: string | null = null;
  const data = (items: unknown[], after: string | null) => ({ scope: 'quests', floor: level, status: args.status,
    quests: items, ...(after === null ? {} : { next: handle('next') }) });
  for (let i = 0; i < page.rows.length; i++) {
    const row = page.rows[i], q = row.quest.quest, item = publicQuest(q, handle(i), false);
    const cursor = i < page.rows.length - 1 || page.next !== undefined ? `quests/floor/${level}/${args.status}/${q.id}` : null;
    if (!fits({ ...header, data: data([...quests, item], cursor) })) {
      if (!rows.length) throw new QuestQueryRefusal('This quest summary exceeds the bounded observation size.');
      break;
    }
    rows.push({ key: row.record.key, id: row.record.id }); quests.push(item); next = cursor;
  }
  const observation = { ...header, data: data(quests, next) };
  jsonBytes(observation, MAX_OBSERVATION_BYTES);
  return { observation, query: { schema: 1, publication: binding.publication, scope: 'quests', level, status: args.status,
    rows, after: selection.after ?? null, next } };
}
