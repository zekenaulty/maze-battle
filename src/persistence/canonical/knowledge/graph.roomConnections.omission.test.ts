// @vitest-environment node
import { expect, it } from 'vitest';
import { listRoomConnections } from './graph.roomConnections';
import { isolatedOlderEdgeFixture, omittedEdgeFixture } from './graph.roomConnections.omission.test-support';
import { meter, roomScope } from './graph.roomConnections.test-support';
import { readKnownCells } from './queries';

it.each(['east', 'north'] as const)('refuses omitted latest-source %s evidence with unchanged IDs and original receipts', async direction => {
  const f = await omittedEdgeFixture(direction, 'none');
  const clean = await listRoomConnections(f.pages, f.checkpoint(), roomScope);
  expect(clean.items.map(c => c.room.spaceId)).toEqual(['target']);
  const id = f.record.id, removed = structuredClone(f.remembered.edges[direction]);
  expect(removed?.target === null).toBe(direction === 'north');
  delete f.remembered.edges[direction];
  const before = structuredClone(f.records), m = meter(f.pages);
  await expect(listRoomConnections(m.pages, f.checkpoint(), roomScope)).rejects.toThrow('omitted');
  await expect(readKnownCells(f.pages, f.checkpoint(), [f.selected.at])).rejects.toThrow('omitted');
  expect(f.record.id).toBe(id); expect(f.records).toEqual(before); expect(m.counts().reads).toBeLessThanOrEqual(256);
});

it.each(['east', 'north'] as const)('refuses omitted older %s evidence when another retained edge still references its receipt', async direction => {
  const f = await omittedEdgeFixture(direction, 'retained');
  expect(f.remembered.source.sequence).toBe(2); expect(f.remembered.edges[direction]!.source.sequence).toBe(1);
  expect(f.remembered.edges.west!.source.sequence).toBe(1);
  delete f.remembered.edges[direction];
  await expect(listRoomConnections(f.pages, f.checkpoint(), roomScope)).rejects.toThrow('omitted');
});

it.each(['east', 'north'] as const)('preserves a lawful older %s edge when newer sight omits its direction', async direction => {
  const f = await omittedEdgeFixture(direction, 'sole'), before = structuredClone(f.records);
  expect(f.remembered.source.sequence).toBe(2); expect(f.remembered.edges[direction]!.source.sequence).toBe(1);
  expect(Object.entries(f.remembered.edges).filter(([d]) => d !== direction).every(([, e]) => e!.source.sequence === 2)).toBe(true);
  const [known] = await readKnownCells(f.pages, f.checkpoint(), [f.selected.at]);
  expect(known.state).toBe('remembered');
  expect((await listRoomConnections(f.pages, f.checkpoint(), roomScope)).items.map(c => c.room.spaceId)).toEqual(['target']);
  expect(f.records).toEqual(before);
});

it.each(['east', 'north'] as const)('resolves an isolated older %s receipt by its surviving exact reference', async direction => {
  const f = await isolatedOlderEdgeFixture(direction);
  expect(f.remembered.source.sequence).toBe(4); expect(f.remembered.edges[direction]!.source.sequence).toBe(3);
  expect(Object.entries(f.remembered.edges).filter(([d]) => d !== direction).every(([, e]) => e!.source.sequence === 4)).toBe(true);
  expect((await listRoomConnections(f.pages, f.checkpoint(), roomScope)).items.map(c => c.room.spaceId)).toEqual(['target']);
});
