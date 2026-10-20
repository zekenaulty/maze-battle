// @vitest-environment node
import { expect, it } from 'vitest';
import { snapshotOf } from '../../../persistence/canonical/read';
import { actionResultWrite } from '../../../persistence/canonical/agentica/actions.result';
import type { StoredContract, StoredQuest } from '../../../persistence/canonical/content/types';
import { jsonBytes } from '../../../persistence/canonical/validation';
import { actionResult } from './actionContract';
import { queryQuests } from './questContext';
import { questContextFixture } from './questContext.test-support';

it('owns private row identities before yielding to original-action reads', async () => {
  const f = await questContextFixture(1), args = { scope: 'quests' as const, status: 'active' as const };
  const { identity } = await f.reserve(args);
  const observed = await queryQuests(f.pages, snapshotOf(f.head), f.binding, identity, args);
  const expected = structuredClone(observed.query);
  const write = actionResultWrite(f.pages, f.head, f.request('agentica.action.resolve', { action: identity.storageKey }),
    identity, actionResult(identity, observed.observation, 'Accepted journal query.'), 'standalone', observed.query);
  observed.query.rows[0].id = 'substituted-record';
  const result = await write;
  expect('value' in result).toBe(true);
  if ('value' in result) expect(result.value.query).toEqual(expected);
});

it('resumes after the last returned row when multibyte summaries fill a page before four candidates', async () => {
  const f = await questContextFixture(6), expected: string[] = [], seen: string[] = [];
  for (const row of f.memory.records.values()) {
    const q = row.key.startsWith('quest/') ? (row.value as unknown as StoredQuest).quest
      : (row.value as unknown as StoredContract).contract;
    q.title = '\u754c'.repeat(160); q.task.noun = '\u754c'.repeat(160);
    if (row.key.startsWith('quest/')) expected.push(row.key);
  }
  let cursor: string | undefined, partial = false;
  for (let n = 0; n < 6; n++) {
    const q = await f.query({ scope: 'quests', status: 'active', ...(cursor ? { cursor } : {}) });
    expect(jsonBytes(q.observation)).toBeLessThanOrEqual(2800);
    expect(jsonBytes(q.result)).toBeLessThanOrEqual(4096);
    seen.push(...q.query.rows.map(row => row.key));
    if (q.query.next) {
      expect(q.query.next).toBe(`quests/floor/1/active/${q.query.rows.at(-1)!.key.slice(6)}`);
      partial ||= q.query.rows.length < 4;
    }
    cursor = q.observation.data.next as string | undefined;
    if (!cursor) break;
  }
  expect(cursor).toBeUndefined(); expect(partial).toBe(true); expect(seen).toEqual(expected.sort());
});
