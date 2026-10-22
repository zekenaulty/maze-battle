// @vitest-environment node
import { expect, it } from 'vitest';
import { connected, earnedCell, graphFixture } from '../../../persistence/canonical/knowledge/graph.test-support';
import type { KnownNode, KnownLink } from '../../../persistence/canonical/knowledge/graph';
import { jsonBytes } from '../../../persistence/canonical/validation';
import { inspectMaze } from './observation';
import { perceptionPublication } from './observation.test-support';

it('pages earned rooms without cell grids or passage masquerading and recalls off-window links', async () => {
  const memory = graphFixture(), pair = connected();
  await memory.observe(pair.cells, pair.spaces);
  for (let n = 0; n < 5; n++) await memory.observe([earnedCell(50 + n, 50, `distant-${n}`)]);
  const f = perceptionPublication(memory), before = structuredClone(memory.records);
  const rooms: KnownNode[] = []; let cursor: string | undefined;
  for (let n = 0; n < 8; n++) {
    const result = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'map', ...(cursor ? { cursor } : {}) });
    expect(jsonBytes(result)).toBeLessThanOrEqual(2800); expect(result.data).not.toHaveProperty('cells');
    rooms.push(...result.data.rooms as KnownNode[]); cursor = result.data.next as string | undefined;
    if (!cursor) break;
  }
  expect(cursor).toBeUndefined(); expect(rooms).toHaveLength(6);
  expect(rooms.every(room => room.kind === 'room')).toBe(true);
  expect(rooms.map(room => room.spaceId)).not.toContain(pair.spaces[1].spaceId);
  const destination = rooms.find(room => room.spaceId === pair.spaces[0].spaceId)!;
  expect(destination.anchor.at).toEqual(pair.cells[0].at);
  const result = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'links', level: 1, spaceId: destination.spaceId });
  const links = result.data.links as KnownLink[];
  expect(links).toHaveLength(1); expect(links[0].to.at).toEqual(pair.cells[1].at);
  expect(links[0].from.source.sequence).toBe(1); expect(jsonBytes(result)).toBeLessThanOrEqual(2800);
  expect(memory.records).toEqual(before); expect(memory.reads.every(key => key.startsWith('perception/'))).toBe(true);
});

it('returns stable scoped data and rejects its cursor on a new publication', async () => {
  const memory = graphFixture();
  for (let n = 0; n < 4; n++) await memory.observe([earnedCell(n, 0, `room-${n}`)]);
  const f = perceptionPublication(memory);
  const first = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'map' });
  const cursor = first.data.next as string;
  expect(cursor).toBeDefined();
  expect(await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'map' })).toEqual(first);
  f.republish();
  await expect(inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'map', cursor })).rejects.toThrow('foreign');
});
