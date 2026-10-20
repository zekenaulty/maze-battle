import type { QuestStatus } from '../../../domain/types';
import type { AgenticaAction, AgenticaResult } from '../../../services/agentica/contracts';
import { fields, natural, text, timestamp } from '../roster/codec';
import { check, integer, jsonBytes, recordKey, validId } from '../validation';
import type { ProtocolRef } from './types';
import { equal, snapshotReference } from './validation';

export interface QuestQueryProof {
  schema: 1; publication: ProtocolRef;
  scope: 'quests' | 'quest'; level: number; status: QuestStatus;
  rows: { key: string; id: string }[]; after: string | null; next: string | null;
}
export interface QuestHandle { schema: 1; publication: ProtocolRef; action: ProtocolRef; selection: number | 'next' }
export type QuestQueryArgs = { scope: 'quests'; status: QuestStatus; cursor?: string } | { scope: 'quest'; target: string };
const statuses = ['active', 'complete', 'claimed'];
export function questArgs(input: unknown): QuestQueryArgs {
  const base = fields(input, 'scope', 'status cursor target');
  if (base.scope === 'quests') {
    const args = fields(base, 'scope status', 'cursor');
    check(statuses.includes(args.status as string), 'invalid quest status');
    if (Object.hasOwn(args, 'cursor')) check(typeof args.cursor === 'string' && args.cursor.length <= 1024, 'invalid quest cursor');
  } else {
    const args = fields(base, 'scope target');
    check(args.scope === 'quest' && typeof args.target === 'string' && args.target.length <= 1024, 'invalid quest selection');
  }
  jsonBytes(base, 2048); return structuredClone(base) as QuestQueryArgs;
}
export function questHandle(publication: ProtocolRef, action: ProtocolRef, selection: number | 'next') {
  const value = { schema: 1, publication: snapshotReference(publication), action: snapshotReference(action), selection };
  jsonBytes(value, 1024); return JSON.stringify(value);
}
export function parseQuestHandle(value: string, publication: ProtocolRef): QuestHandle {
  check(typeof value === 'string' && value.length <= 1024, 'invalid quest handle');
  const row = fields(JSON.parse(value), 'schema publication action selection');
  jsonBytes(row, 1024);
  const ref = snapshotReference(row.publication as unknown as ProtocolRef), action = snapshotReference(row.action as unknown as ProtocolRef);
  check(row.schema === 1 && equal(ref, publication) && /^agentica\/actions\/[a-f0-9]{64}$/.test(action.key)
    && (row.selection === 'next' || integer(row.selection) && (row.selection as number) < 4), 'invalid quest handle');
  return { schema: 1, publication: ref, action, selection: row.selection as number | 'next' };
}
/** Private result witness. It is never part of the Agentica result or observation. */
export function questQueryProof(input: unknown): QuestQueryProof {
  jsonBytes(input, 4096);
  const row = fields(input, 'schema publication scope level status rows after next');
  snapshotReference(row.publication as unknown as ProtocolRef);
  check(row.schema === 1 && ['quests', 'quest'].includes(row.scope as string)
    && integer(row.level, 1) && statuses.includes(row.status as string)
    && Array.isArray(row.rows) && row.rows.length <= 4, 'invalid quest query proof');
  for (const value of row.rows) {
    const ref = fields(value, 'key id'); recordKey(ref.key as string);
    check((ref.key as string).startsWith('quest/') && validId((ref.key as string).slice(6)) && validId(ref.id), 'invalid accepted quest reference');
  }
  const prefix = `quests/floor/${row.level}/${row.status}/`;
  for (const cursor of [row.after, row.next]) check(cursor === null || typeof cursor === 'string'
    && cursor.startsWith(prefix) && validId(cursor.slice(prefix.length)), 'invalid private quest cursor');
  const keys = row.rows.map(value => (value as { key: string }).key);
  check(new Set(keys).size === keys.length, 'duplicate quest query row');
  if (row.scope === 'quest') check(keys.length === 1 && row.after === null && row.next === null, 'invalid detail witness');
  else {
    const indexes = keys.map(key => prefix + key.slice(6));
    check(indexes.every((key, i) => key > (i ? indexes[i - 1] : row.after as string | null ?? ''))
      && (row.next === null || row.next === indexes.at(-1)), 'invalid quest page continuation');
  }
  return structuredClone(row) as unknown as QuestQueryProof;
}
export function validateQuestResult(input: unknown, action: AgenticaAction, publication: ProtocolRef,
  original: ProtocolRef, result: AgenticaResult, level: number): QuestQueryProof | undefined {
  if (action.capabilityId !== 'maze.inspect' || !['quests', 'quest'].includes(action.arguments.scope as string) || result.disposition !== 'applied') {
    check(input === undefined, 'unexpected quest query proof'); return undefined;
  }
  const proof = questQueryProof(input), args = questArgs(action.arguments);
  check(equal(proof.publication, publication) && proof.level === level && proof.scope === args.scope
    && (args.scope !== 'quests' || args.status === proof.status), 'quest query source changed');
  const data = fields(result.observation?.data, 'scope floor', proof.scope === 'quests' ? 'status quests next' : 'quest');
  check(data.scope === proof.scope && data.floor === proof.level, 'quest query projection changed');
  const rows = proof.scope === 'quests' ? data.quests : [data.quest];
  check(Array.isArray(rows) && rows.length === proof.rows.length, 'quest query membership changed');
  if (proof.scope === 'quests') check(data.status === proof.status
    && (proof.next === null ? !Object.hasOwn(data, 'next') : data.next === questHandle(publication, original, 'next')), 'quest cursor changed');
  rows.forEach((value, i) => {
    const detail = proof.scope === 'quest';
    const row = fields(value, `target title status task reward${detail ? ' description targetName acceptedAt' : ''}`,
      detail ? 'completedAt claimedAt' : '');
    check(row.target === questHandle(publication, original, i) && row.status === proof.status, 'quest selector changed');
    text(row.title); natural(fields(row.reward, 'gold').gold);
    const task = fields(row.task, 'objective noun required progress', detail ? 'itemName monsterTags' : '');
    check(['fetch', 'kill', 'scout', 'locate'].includes(task.objective as string), 'invalid projected quest objective');
    text(task.noun); natural(task.required, 1); natural(task.progress);
    check((task.progress as number) <= (task.required as number), 'invalid projected quest progress');
    if (task.itemName !== undefined) text(task.itemName);
    if (task.monsterTags !== undefined) check(Array.isArray(task.monsterTags) && task.monsterTags.length <= 7
      && task.monsterTags.every(tag => typeof tag === 'string'
        && ['vermin', 'beast', 'undead', 'reptile', 'arcane', 'construct', 'ooze'].includes(tag)), 'invalid projected monster tags');
    if (detail) {
      text(row.description, 512); text(row.targetName); timestamp(row.acceptedAt);
      if (row.completedAt !== undefined) timestamp(row.completedAt);
      if (row.claimedAt !== undefined) timestamp(row.claimedAt);
    }
  });
  return proof;
}
