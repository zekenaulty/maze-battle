// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { snapshotOf } from '../../../persistence/canonical/read';
import { jsonBytes } from '../../../persistence/canonical/validation';
import { questArgs } from '../../../persistence/canonical/agentica/quest.proof';
import { addQuest } from '../../../persistence/canonical/content/acceptedQueries.test-support';
import type { StoredContract, StoredQuest } from '../../../persistence/canonical/content/types';
import type { ActionResult } from '../../../persistence/canonical/agentica/types';
import { queryQuests } from './questContext';
import { questContextFixture } from './questContext.test-support';
import type { AgenticaObservation } from '../contracts';

type Summary = { target: string; title: string; status: string; task: { progress: number }; description?: string };
type Data = { quests: Summary[]; next?: string; quest: Summary };
const data = (value: { observation: AgenticaObservation }) => value.observation.data as unknown as Data;

describe('explicit accepted-quest projection', () => {
  it('pages all rows exactly once with opaque cursors, no hidden reads and bounded work/output', async () => {
    const f = await questContextFixture(9), names: string[] = [];
    let cursor: string | undefined, pages = 0;
    do {
      vi.mocked(f.pages.get).mockClear(); vi.mocked(f.pages.scan).mockClear();
      const q = await f.query({ scope: 'quests', status: 'active', ...(cursor ? { cursor } : {}) }), d = data(q);
      expect(jsonBytes(q.observation)).toBeLessThanOrEqual(2800); expect(jsonBytes(q.result)).toBeLessThanOrEqual(4096);
      expect(d.quests.length).toBeGreaterThan(0); expect(d.quests.length).toBeLessThanOrEqual(4);
      const reads = vi.mocked(f.pages.get).mock.calls.filter(([area]) => area === 'world');
      expect(reads.length).toBeLessThanOrEqual(8);
      expect(reads.every(([, key]) => /^(quest|contract)\//.test(key))).toBe(true);
      expect(vi.mocked(f.pages.scan).mock.calls).toEqual([['world', 'quests/floor/1/active/', cursor ? q.query.after : undefined, 4]]);
      const serialized = JSON.stringify(q.result);
      for (const entry of f.memory.records.values()) {
        const row = entry.value as unknown as StoredQuest;
        if (entry.key.startsWith('quest/')) {
          expect(serialized).not.toContain(row.quest.id); expect(serialized).not.toContain(row.quest.targetRoomId);
        }
      }
      for (const ref of q.query.rows) names.push(ref.key);
      expect(q.source.query?.rows).toHaveLength(d.quests.length); expect(serialized).not.toContain('recordWitness');
      cursor = d.next; expect(++pages).toBeLessThanOrEqual(9);
    } while (cursor);
    expect(names).toHaveLength(9); expect(new Set(names).size).toBe(9);
  });
  it('returns disclosed detail using the publication time, not old sight, without copying item tokens or coordinates', async () => {
    const f = await questContextFixture(1), listed = await f.query({ scope: 'quests', status: 'active' });
    const detailed = await f.query({ scope: 'quest', target: data(listed).quests[0].target });
    expect(data(detailed).quest).toMatchObject({ title: 'Recover Cache: Vault', status: 'active' });
    expect(data(detailed).quest.description).toContain('Unmapped room');
    expect(detailed.observation.observedAt).toBe('2026-10-20T00:59:00.000Z');
    expect(data(detailed).quest).not.toHaveProperty('targetRoomId'); expect(data(detailed).quest).not.toHaveProperty('originRoomId');
    expect(JSON.stringify(detailed.result)).not.toContain('baseId'); expect(JSON.stringify(detailed.result)).not.toContain('token');
    expect((await f.read(detailed.identity, detailed.resultRef)).result).toEqual(detailed.result);
  });
  it('filters only the requested accepted status and keeps an empty terminal page explicit', async () => {
    const f = await questContextFixture(0);
    await addQuest(f.memory, 'done', 'complete'); await addQuest(f.memory, 'paid', 'claimed');
    expect(data(await f.query({ scope: 'quests', status: 'active' }))).toEqual({ scope: 'quests', floor: 1, status: 'active', quests: [] });
    expect(data(await f.query({ scope: 'quests', status: 'complete' })).quests).toHaveLength(1);
    expect(data(await f.query({ scope: 'quests', status: 'claimed' })).quests).toHaveLength(1);
  });
  it('replays the exact original after state/custody changes without rereading quest state', async () => {
    const f = await questContextFixture(1), q = await f.query({ scope: 'quests', status: 'active' });
    f.memory.records.clear(); f.head.owner = 'new-owner'; f.head.epoch++; f.head.roots.world = 'new-world';
    vi.mocked(f.pages.get).mockClear(); vi.mocked(f.pages.scan).mockClear();
    expect((await f.read(q.identity, q.resultRef)).result).toEqual(q.result);
    expect(vi.mocked(f.pages.get).mock.calls.every(([area]) => area === 'execution')).toBe(true);
    expect(f.pages.scan).not.toHaveBeenCalled();
    const { identity } = await f.reserve({ scope: 'quests', status: 'active' });
    await expect(queryQuests(f.pages, snapshotOf(f.head), f.binding, identity, { scope: 'quests', status: 'active' })).rejects.toThrow('differs');
  });
  it.each(['status', 'publication', 'ordinal', 'grant', 'missing-result', 'missing-receipt', 'not-a-page'])
    ('refuses an invalid %s selection instead of reading arbitrary quest keys', async changed => {
      const f = await questContextFixture(6), first = await f.query({ scope: 'quests', status: 'active' }), token = JSON.parse(data(first).next!);
      let status = 'active' as 'active' | 'complete';
      if (changed === 'status') status = 'complete';
      if (changed === 'publication') token.publication.id = 'other';
      if (changed === 'ordinal') token.selection = 99;
      if (changed === 'grant') f.binding.grant.id = 'other';
      if (changed === 'missing-result') f.execution.delete(first.resultRef.key);
      if (changed === 'missing-receipt') f.receipts.delete(first.source.sourceAttemptId);
      if (changed === 'not-a-page') token.selection = 0;
      const args = { scope: 'quests' as const, status, cursor: JSON.stringify(token) }, { identity } = await f.reserve(args);
      vi.mocked(f.pages.get).mockClear();
      await expect(queryQuests(f.pages, snapshotOf(f.head), f.binding, identity, args)).rejects.toThrow('not valid');
      expect(vi.mocked(f.pages.get).mock.calls.every(([area]) => area !== 'world')).toBe(true);
    });
  it('fails closed on a source-consistent altered private witness', async () => {
    const f = await questContextFixture(1), q = await f.query({ scope: 'quests', status: 'active' });
    const row = f.execution.get(q.resultRef.key)!; (row.value as unknown as ActionResult).query!.level = 2; f.rewrite(row);
    await expect(f.read(q.identity, q.resultRef)).rejects.toThrow();
  });
  it.each(['missing', 'duplicate', 'status', 'publication', 'next', 'selector', 'count', 'private-field', 'nested-private-field', 'scope'])
    ('rejects source-consistent %s query/result corruption', async changed => {
      const f = await questContextFixture(6), q = await f.query({ scope: 'quests', status: 'active' });
      const row = f.execution.get(q.resultRef.key)!, value = row.value as unknown as ActionResult, proof = value.query!;
      const d = value.result.observation!.data as unknown as Data;
      if (changed === 'missing') delete value.query;
      if (changed === 'duplicate') proof.rows[1] = proof.rows[0];
      if (changed === 'status') proof.status = 'claimed';
      if (changed === 'publication') proof.publication.id = 'other';
      if (changed === 'next') proof.next = 'quests/floor/1/active/other';
      if (changed === 'selector') d.quests[0].target = d.quests[1].target;
      if (changed === 'count') d.quests.pop();
      if (changed === 'private-field') Object.assign(d.quests[0], { questId: proof.rows[0].key });
      if (changed === 'nested-private-field') Object.assign(d.quests[0].task, { token: 'private-item-token' });
      if (changed === 'scope') proof.scope = 'quest';
      f.rewrite(row); await expect(f.read(q.identity, q.resultRef)).rejects.toThrow();
    });
  it('owns query inputs before yielding and leaves the authoritative game roots unchanged', async () => {
    const f = await questContextFixture(1), args = { scope: 'quests' as const, status: 'active' as const };
    const { identity } = await f.reserve(args), snapshot = snapshotOf(f.head), binding = structuredClone(f.binding), before = structuredClone(snapshot);
    const query = queryQuests(f.pages, snapshot, binding, identity, args);
    binding.publication.id = 'foreign'; snapshot.checkpoint.wave = 900; Object.assign(args, { status: 'claimed' });
    expect(data(await query).quests[0].status).toBe('active');
    expect(f.head.roots).toEqual(before.roots); expect(f.head.checkpoint).toEqual(before.checkpoint);
  });
  it('refuses a single oversized multibyte detail rather than silently truncating it', async () => {
    const f = await questContextFixture(1);
    for (const row of f.memory.records.values()) {
      const q = row.key.startsWith('quest/') ? (row.value as unknown as StoredQuest).quest : (row.value as unknown as StoredContract).contract;
      q.description = '\u754c'.repeat(512); q.targetRoomName = '\u754c'.repeat(160); q.task.item!.displayName = '\u754c'.repeat(160);
    }
    const q = await f.query({ scope: 'quests', status: 'active' });
    await expect(f.query({ scope: 'quest', target: data(q).quests[0].target })).rejects.toThrow('detail exceeds');
  });
  it.each([
    { scope: 'quests' }, { scope: 'quests', status: 'all' }, { scope: 'quests', status: 'active', level: 2 },
    { scope: 'quest', target: 'q', status: 'active' }, { scope: 'quest', target: 'x'.repeat(1025) },
  ])('rejects mixed or unbounded query fields %j', input => expect(() => questArgs(input)).toThrow());
});
