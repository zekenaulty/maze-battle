// @vitest-environment node
import { expect, it } from 'vitest';
import { GraphCursorRefusal } from './graph.cursor';
import { listRoomConnections } from './graph.roomConnections';
import { roomConnectionsCursor } from './graph.roomConnections.cursor';
import { branches, cell, graphFixture, meter, observe, roomScope } from './graph.roomConnections.test-support';
import { observationKey } from './keys';
import type { KnowledgeRead } from './types';

it('pages six distant room identities across three pages, without scanning intervening history', async () => {
  const f = graphFixture(); await branches(f);
  for (let n = 0; n < 20; n++) await observe(f, [cell(30, 30, 'away')], ['away']);
  const all: string[] = []; let cursor: string | undefined;
  for (let n = 0; n < 3; n++) {
    const m = meter(f.pages), page = await listRoomConnections(m.pages, f.checkpoint(), { ...roomScope, cursor, limit: 2 });
    expect(page.items).toHaveLength(2); all.push(...page.items.map(c => c.room.spaceId)); cursor = page.next;
    expect(page.items.every(c => c.room.anchor.source.sequence === 1)).toBe(true);
    expect(m.counts().reads).toBeLessThanOrEqual(256);
    expect(m.keys.filter(k => k.includes('/observation/')).every(k => k.includes(observationKey(1)) || k.includes(observationKey(21)))).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(2800);
  }
  expect(all).toEqual(['a', 'b', 'c', 'd', 'e', 'f']); expect(cursor).toBeUndefined();
});

it('binds cursor shape, scope, exact knowledge witness and terminal member/path commitment', async () => {
  const f = graphFixture(); await branches(f);
  const checkpoint = f.checkpoint(), page = await listRoomConnections(f.pages, checkpoint, { ...roomScope, limit: 1 });
  const c = JSON.parse(page.next!);
  const cases = ['{', page.next! + ' ', JSON.stringify({ ...c, extra: true }),
    JSON.stringify({ ...c, level: 2 }), JSON.stringify({ ...c, spaceId: 'other' }),
    JSON.stringify({ ...c, anchor: { ...c.anchor, witness: 'different' } }),
    JSON.stringify({ ...c, after: { ...c.after, spaceId: 'unseen' } }),
    JSON.stringify({ ...c, after: { ...c.after, digest: `sha256:${'0'.repeat(64)}` } })];
  for (const cursor of cases)
    await expect(listRoomConnections(f.pages, checkpoint, { ...roomScope, cursor })).rejects.toBeInstanceOf(GraphCursorRefusal);
  const second = await listRoomConnections(f.pages, checkpoint, { ...roomScope, cursor: page.next, limit: 4 });
  const final = await listRoomConnections(f.pages, checkpoint, { ...roomScope, cursor: second.next });
  const terminal = roomConnectionsCursor(page.anchor, roomScope, final.items[0]);
  await expect(listRoomConnections(f.pages, checkpoint, { ...roomScope, cursor: terminal })).rejects.toBeInstanceOf(GraphCursorRefusal);
  await observe(f, [cell(30, 30, 'away')], ['away']);
  await expect(listRoomConnections(f.pages, f.checkpoint(), { ...roomScope, cursor: page.next })).rejects.toBeInstanceOf(GraphCursorRefusal);
});

it.each([0, 5, -1, 1.5, NaN])('rejects invalid limit %s without any reads', async limit => {
  const f = graphFixture(), m = meter(f.pages);
  await expect(listRoomConnections(m.pages, f.checkpoint(), { ...roomScope, limit })).rejects.toThrow();
  expect(m.counts().reads).toBe(0);
});

it('snapshots checkpoint, query and reader methods before awaits, and detaches returned anchors', async () => {
  const f = graphFixture(); await branches(f);
  const checkpoint = f.checkpoint(), input = { ...roomScope, limit: 1 };
  let release!: () => void; const wait = new Promise<void>(r => { release = r; });
  const pages: KnowledgeRead = { get: f.pages.get.bind(f.pages), scan: f.pages.scan.bind(f.pages),
    witness: async (...args) => { await wait; return f.pages.witness(...args); } };
  const pending = listRoomConnections(pages, checkpoint, input);
  checkpoint.knowledge!.id = 'changed'; checkpoint.position.level = 20; input.spaceId = 'hidden'; input.limit = 4;
  pages.get = async () => { throw Error('Changed reader'); }; release();
  const value = await pending; expect(value.items).toHaveLength(1); expect(value.from.spaceId).toBe('origin');
  value.items[0].room.anchor.at.level = 20; value.from.anchor.source.id = 'changed';
  expect((await listRoomConnections(f.pages, f.checkpoint(), roomScope)).from.anchor.source.id).not.toBe('changed');
});
