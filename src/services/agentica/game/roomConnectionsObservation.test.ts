// @vitest-environment node
import { expect, it } from 'vitest';
import { branches, cell, chain, graphFixture, observe } from '../../../persistence/canonical/knowledge/graph.roomConnections.test-support';
import type { RoomConnection } from '../../../persistence/canonical/knowledge/graph.roomConnections';
import { observationKey } from '../../../persistence/canonical/knowledge/keys';
import { jsonBytes } from '../../../persistence/canonical/validation';
import { prepareAction } from '../../../persistence/canonical/agentica/validation';
import { protocolAction } from '../../../persistence/canonical/agentica/types.test-support';
import { actionResult } from './actionContract';
import { inspectMaze } from './observation';
import { perceptionPublication } from './observation.test-support';

it('collapses only earned passages while preserving raw space links and source anchors', async () => {
  const memory = graphFixture(); await observe(memory, chain());
  await observe(memory, [cell(30, 30, 'away')], ['away']);
  const f = perceptionPublication(memory), before = structuredClone(memory.records), writes = memory.writes.length;
  memory.reads.length = 0;
  const result = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'connections', level: 1, spaceId: 'origin' });
  const items = result.data.connections as RoomConnection[];
  expect(result.data).toMatchObject({ scope: 'connections', room: { spaceId: 'origin', kind: 'room' }, coverage: 'indexed-exits', state: 'complete' });
  expect(items).toHaveLength(1); expect(items[0]).toMatchObject({ room: { spaceId: 'target', kind: 'room', anchor: { source: { sequence: 1 } } },
    proof: { steps: 5, crossings: 3 } });
  expect(JSON.stringify(result)).not.toContain('room-label'); expect(result.data.next).toBeUndefined();
  expect(memory.reads.every(key => key.startsWith('perception/'))).toBe(true);
  expect(memory.reads.length).toBeLessThanOrEqual(256);
  const raw = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'links', spaceId: 'origin' });
  expect(raw.data).toMatchObject({ scope: 'links', links: [{ to: { at: { cell: { spaceId: 'room-label-0' } } } }] });
  expect(memory.records).toEqual(before); expect(memory.writes).toHaveLength(writes);
});

it('pages all six rooms exactly once under public envelopes, including distant recall', async () => {
  const memory = graphFixture(); await branches(memory);
  for (let n = 0; n < 3; n++) await observe(memory, [cell(30, 30, 'away')], ['away']);
  const f = perceptionPublication(memory), rows: string[] = [], metrics = [];
  const identity = await prepareAction({ ...protocolAction(f.publication.wireRevision), arguments: { scope: 'connections', spaceId: 'origin' } });
  let cursor: string | undefined;
  for (let n = 0; n < 6; n++) {
    memory.reads.length = 0;
    const view = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'connections', spaceId: 'origin', ...(cursor ? { cursor } : {}) });
    const items = view.data.connections as RoomConnection[];
    expect(items).toHaveLength(1); rows.push(items[0].room.spaceId);
    expect(items[0].room.anchor.source.sequence).toBe(1);
    cursor = view.data.next as string | undefined;
    if (cursor) { expect(cursor.length).toBeLessThanOrEqual(1024); expect(JSON.parse(cursor).after.length).toBeLessThanOrEqual(768); }
    const result = actionResult(identity, view, 'Earned observation returned without refreshing sight.');
    expect(jsonBytes(view)).toBeLessThanOrEqual(2800); expect(jsonBytes(result)).toBeLessThanOrEqual(4096);
    expect(result.operation).toBeUndefined(); expect(result.completion).toBeUndefined();
    expect(memory.reads.filter(k => k.includes('/observation/')).every(k => k.includes(observationKey(1)) || k.includes(observationKey(4)))).toBe(true);
    metrics.push({ reads: memory.reads.length, observationBytes: jsonBytes(view), resultBytes: jsonBytes(result) });
  }
  expect(rows).toEqual(['a', 'b', 'c', 'd', 'e', 'f']); expect(cursor).toBeUndefined();
  console.info('connections six-page wrapper:', JSON.stringify(metrics));
});

it('keeps unknown, absent-floor and nonroom selections equally opaque, distinct from empty known rooms', async () => {
  const memory = graphFixture(); await observe(memory, chain());
  const f = perceptionPublication(memory), query = (spaceId: string, level = 1) => inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'connections', spaceId, level });
  const refused = await query('unseen');
  expect(refused.data).toEqual({ scope: 'connections', state: 'refused', reason: 'not-known-room' });
  expect(await query('absent')).toEqual(refused); expect(await query('room-label-0')).toEqual(refused); expect(await query('origin', 2)).toEqual(refused);
  await observe(memory, [cell(30, 30, 'empty')], ['empty']); f.republish();
  expect((await query('empty')).data).toMatchObject({ state: 'complete', coverage: 'indexed-exits', connections: [] });
});

it('preserves partial and unavailable states, and never converts corrupt evidence into absence', async () => {
  const memory = graphFixture(), cells = chain(1, 5);
  await observe(memory, cells.slice(0, 3)); await observe(memory, cells.slice(4));
  const f = perceptionPublication(memory), query = () => inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'connections', spaceId: 'origin' });
  expect((await query()).data).toMatchObject({ state: 'partial', reason: 'unseen-passage', connections: [] });
  memory.records.delete(`${observationKey(1)}/integrity`);
  await expect(query()).rejects.toThrow();
  const unavailable = perceptionPublication(graphFixture());
  expect((await inspectMaze(unavailable.pages, unavailable.snapshot, unavailable.ref, { scope: 'connections' })).data)
    .toEqual({ scope: 'connections', state: 'unavailable' });
});

it('owns caller inputs before the first await and does not cache source trust across calls', async () => {
  const memory = graphFixture(); await branches(memory); const f = perceptionPublication(memory);
  const args = { scope: 'connections' as const, level: 1, spaceId: 'origin' }, snapshot = structuredClone(f.snapshot), ref = { ...f.ref };
  const saved = f.pages.savedSnapshot; let release!: () => void;
  const pause = new Promise<void>(r => { release = r; });
  f.pages.savedSnapshot = async key => { await pause; return saved(key); };
  const pending = inspectMaze(f.pages, snapshot, ref, args);
  args.spaceId = 'unseen'; snapshot.checkpoint.mode = 'town'; ref.id = 'changed'; release();
  expect((await pending).data.room).toMatchObject({ spaceId: 'origin' });
  const header = memory.records.get(observationKey(1))!; header.revision++;
  await expect(inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'connections' })).rejects.toThrow();
});
