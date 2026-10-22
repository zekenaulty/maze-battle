// @vitest-environment node
import { expect, it } from 'vitest';
import { KnownGraphUnavailableError, listKnownLinks, listKnownNodes, readKnownAnchor } from './graph';
import { connected, earnedCell, graphFixture } from './graph.test-support';
import { floorKey, GRAPH_KEY, linksKey, nodeKey } from './graph.records';
import { observationKey } from './keys';
import { worldIndexDigest } from './worldIndex.evidence';
import type { ObservationHeader } from './types';

it.each(['marker', 'marker-proof', 'both-markers', 'node', 'node-proof', 'floor', 'adjacency', 'source', 'chunk'])('refuses missing %s as corruption, not unavailable', async missing => {
  const f = graphFixture(), pair = connected(); await f.observe(pair.cells, pair.spaces);
  const keys: Record<string, string> = { marker: GRAPH_KEY, 'marker-proof': `${GRAPH_KEY}/integrity`, 'both-markers': GRAPH_KEY,
    node: nodeKey(1, pair.spaces[0].spaceId), 'node-proof': `${nodeKey(1, pair.spaces[0].spaceId)}/integrity`, floor: floorKey(1),
    adjacency: linksKey(1, pair.spaces[0].spaceId), source: observationKey(1), chunk: `${observationKey(1)}/0` };
  f.records.delete(keys[missing]); if (missing === 'both-markers') f.records.delete(`${GRAPH_KEY}/integrity`);
  const before = structuredClone(f.records);
  await expect(listKnownLinks(f.pages, f.checkpoint(), { level: 1, spaceId: pair.spaces[0].spaceId })).rejects.not.toBeInstanceOf(KnownGraphUnavailableError);
  expect(f.records).toEqual(before);
});

it.each(['hidden', 'missing', 'wrong-index', 'foreign-level', 'kind', 'duplicate'])('refuses %s observation classification/provenance', async fault => {
  const f = graphFixture(), pair = connected(); await f.observe(pair.cells, pair.spaces);
  const header = f.records.get(observationKey(1))!.value as unknown as ObservationHeader;
  if (fault === 'hidden') header.spaces!.push({ spaceId: 'unseen', kind: 'room', index: 0 });
  if (fault === 'missing') header.spaces!.pop();
  if (fault === 'wrong-index') header.spaces![0].index = 1;
  if (fault === 'foreign-level') header.actor.level = 2;
  if (fault === 'kind') header.spaces![0].kind = 'passage';
  if (fault === 'duplicate') header.spaces!.push(header.spaces![0]);
  await expect(readKnownAnchor(f.pages, f.checkpoint(), { level: 1, spaceId: pair.spaces[0].spaceId })).rejects.toThrow();
});

it('does not silently skip a missing index member, even with its integrity record removed', async () => {
  const f = graphFixture(); await f.observe([earnedCell(0, 0, 'a'), earnedCell(0, 1, 'b'), earnedCell(0, 2, 'c')]);
  f.records.delete(nodeKey(1, 'b')); f.records.delete(`${nodeKey(1, 'b')}/integrity`);
  await expect(listKnownNodes(f.pages, f.checkpoint(), { level: 1, kind: 'room' })).rejects.toThrow('missing from graph');
});

it('detects reciprocal omission even when a replacement adjacency digest is internally consistent', async () => {
  const f = graphFixture(), pair = connected(); await f.observe(pair.cells, pair.spaces);
  const key = linksKey(1, pair.spaces[1].spaceId), row = f.records.get(key)!;
  (row.value as { links: unknown[] }).links = [];
  (f.records.get(`${key}/integrity`)!.value as { digest: string }).digest = worldIndexDigest(row.value);
  await expect(listKnownLinks(f.pages, f.checkpoint(), { level: 1, spaceId: pair.spaces[0].spaceId })).rejects.toThrow('reciprocal index');
});

it('binds cursors to exact anchor, kind, level and original node identity but allows a smaller next page', async () => {
  const f = graphFixture(); await f.observe([earnedCell(0, 0, 'a'), earnedCell(0, 1, 'b'), earnedCell(0, 2, 'c')]);
  const original = f.checkpoint(), first = await listKnownNodes(f.pages, original, { level: 1, kind: 'room', limit: 1 });
  expect((await listKnownNodes(f.pages, original, { level: 1, kind: 'room', limit: 2, cursor: first.next })).items.map(n => n.spaceId)).toEqual(['b', 'c']);
  for (const input of [{ level: 1, kind: 'all' as const }, { level: 2, kind: 'room' as const }])
    await expect(listKnownNodes(f.pages, original, { ...input, cursor: first.next })).rejects.toThrow('foreign');
  for (const cursor of ['{', JSON.stringify({ ...JSON.parse(first.next!), extra: true }),
    JSON.stringify({ ...JSON.parse(first.next!), after: { spaceId: 'a', ordinal: 2 } }), first.next! + ' '])
    await expect(listKnownNodes(f.pages, original, { level: 1, kind: 'room', cursor })).rejects.toThrow();
  await f.observe([earnedCell(30, 30, 'away')]);
  await expect(listKnownNodes(f.pages, f.checkpoint(), { level: 1, kind: 'room', cursor: first.next })).rejects.toThrow('stale');
});

it.each([0, 5, -1, 1.5, Number.NaN])('refuses page limit %s before reading', async limit => {
  const f = graphFixture(); f.reads.length = 0;
  await expect(listKnownNodes(f.pages, f.checkpoint(), { level: 1, kind: 'room', limit })).rejects.toThrow();
  expect(f.reads).toEqual([]);
});
