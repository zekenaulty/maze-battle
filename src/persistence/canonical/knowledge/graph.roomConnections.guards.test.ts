// @vitest-environment node
import { expect, it } from 'vitest';
import { KnownGraphUnavailableError } from './graph';
import { listRoomConnections } from './graph.roomConnections';
import { branches, cell, chain, graphFixture, join, meter, observe, roomScope } from './graph.roomConnections.test-support';
import { blockKey, localKey, observationKey } from './keys';
import { linksKey } from './graph.records';
import { worldIndexDigest } from './worldIndex.evidence';
import type { MemoryBlock, ObservedCell } from './types';

it.each(['unknown', 'passage', 'level'])('refuses a %s selection without treating it as an empty known room', async kind => {
  const f = graphFixture(); await observe(f, chain());
  const scope = kind === 'level' ? { ...roomScope, level: 2 } : { ...roomScope, spaceId: kind === 'passage' ? 'room-label-0' : 'unknown' };
  await expect(listRoomConnections(f.pages, f.checkpoint(), scope)).rejects.toThrow('known room');
});

it('refuses unavailable projections instead of falling back to old room records', async () => {
  const f = graphFixture();
  await expect(listRoomConnections(f.pages, f.checkpoint(), roomScope)).rejects.toBeInstanceOf(KnownGraphUnavailableError);
  await f.observe([cell(0, 0, 'origin')], undefined, false);
  const before = structuredClone(f.records);
  await expect(listRoomConnections(f.pages, f.checkpoint(), roomScope)).rejects.toBeInstanceOf(KnownGraphUnavailableError);
  expect(f.records).toEqual(before);
});

it.each(['source', 'reciprocal', 'memory', 'endpoint'])('fails closed on corrupt %s evidence without a partial success', async fault => {
  const f = graphFixture(), cells = chain(); await observe(f, cells);
  await observe(f, [cell(30, 30, 'away')], ['away']);
  if (fault === 'source') f.records.delete(`${observationKey(1)}/integrity`);
  if (fault === 'reciprocal') {
    const key = linksKey(1, 'target'), row = f.records.get(key)!;
    (row.value as { links: unknown[] }).links = [];
    (f.records.get(`${key}/integrity`)!.value as { digest: string }).digest = worldIndexDigest(row.value);
  }
  if (fault === 'memory' || fault === 'endpoint') {
    const block = f.records.get(blockKey(cells[2].at))!.value as unknown as MemoryBlock;
    if (fault === 'memory') block.cells[localKey(cells[2].at)].world.column++;
    else delete block.cells[localKey(cells[2].at)];
  }
  const before = structuredClone(f.records);
  await expect(listRoomConnections(f.pages, f.checkpoint(), roomScope)).rejects.toThrow(); expect(f.records).toEqual(before);
});

it('rejects stale traversable adjacency even when its original receipt and digest remain intact', async () => {
  const f = graphFixture(), cells = chain(); await observe(f, cells);
  const originalLinks = structuredClone([...f.records].filter(([k]) => k.startsWith('perception/graph/links/')));
  const closed = structuredClone(cells.at(-1)!); closed.edges.west = null; await observe(f, [closed]);
  for (const [key, row] of originalLinks) f.records.set(key, row);
  await observe(f, [cell(30, 30, 'away')], ['away']);
  await expect(listRoomConnections(f.pages, f.checkpoint(), roomScope)).rejects.toThrow('current memory');
});

it('does not read unrelated hidden world data, and changes there leave bytes, cursors and IO identical', async () => {
  const f = graphFixture(); await branches(f);
  const scope = { ...roomScope, limit: 1 }, a = meter(f.pages);
  const first = await listRoomConnections(a.pages, f.checkpoint(), scope);
  const exemplar = structuredClone(f.records.values().next().value!);
  for (const name of ['geometry', 'chests', 'target', 'quests'])
    f.records.set(`hidden/${name}`, { ...exemplar, area: 'world', key: `hidden/${name}`, value: { unseen: name.repeat(100) } });
  const before = structuredClone(f.records), b = meter(f.pages);
  expect(await listRoomConnections(b.pages, f.checkpoint(), scope)).toEqual(first);
  expect(b.keys).toEqual(a.keys); expect(b.counts()).toEqual(a.counts()); expect(f.records).toEqual(before);
  expect(b.keys.every(k => k.startsWith('knowledge:'))).toBe(true);
});

it('shares the 256-read cap across all hops and refuses rather than returning an earlier successful branch', async () => {
  const f = graphFixture(), cells = chain(40, 1), near = cell(1, 0, 'near'); join(cells[0], near, 'south');
  await observe(f, [cells[0], cells[1], near], ['origin', 'target', 'near']);
  for (let n = 1; n < cells.length - 1; n++) await observe(f, cells.slice(n, n + 2));
  const m = meter(f.pages), before = structuredClone(f.records);
  await expect(listRoomConnections(m.pages, f.checkpoint(), { ...roomScope, limit: 1 })).rejects.toThrow('graph read budget exhausted');
  expect(m.counts().reads).toBe(256); expect(f.records).toEqual(before);
});

it('shares the 1 MiB byte cap across validated source observations, not a fresh cap for each passage', async () => {
  const f = graphFixture(), cells = chain(16, 1), filler: ObservedCell[] = [];
  const name = 'f'.repeat(128);
  for (let n = 0; n < 111; n++) filler.push(cell(100 + Math.floor(n / 11), 100 + n % 11, name));
  for (let n = 0; n < filler.length; n++) {
    if (n % 11 < 10 && n + 1 < filler.length) join(filler[n], filler[n + 1]);
    if (n + 11 < filler.length) join(filler[n], filler[n + 11], 'south');
  }
  // Large but schema-valid explicit sight receipts exercise accounting; this is not a normal-sight claim.
  for (let n = 0; n < cells.length - 1; n++) await observe(f, [...cells.slice(n, n + 2), ...filler], ['origin', 'target', name]);
  const m = meter(f.pages), before = structuredClone(f.records);
  await expect(listRoomConnections(m.pages, f.checkpoint(), roomScope)).rejects.toThrow('graph byte budget exhausted');
  expect(m.counts().reads).toBeLessThanOrEqual(256); expect(m.counts().bytes).toBeGreaterThan(1024 * 1024);
  // The existing graph reader charges a received record before validating/using it, then refuses immediately.
  expect(m.counts().bytes).toBeLessThanOrEqual(1024 * 1024 + 64 * 1024); expect(f.records).toEqual(before);
});
