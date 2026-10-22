// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { chain, graphFixture, observe } from '../../../persistence/canonical/knowledge/graph.roomConnections.test-support';
import { listRoomConnections } from '../../../persistence/canonical/knowledge/graph.roomConnections';
import { inspectMaze } from './observation';
import { perceptionPublication } from './observation.test-support';

it('refuses a fragmented component at the existing shared perception cap without partial success or writes', async () => {
  const memory = graphFixture(), cells = chain(40, 1);
  for (let n = 0; n < cells.length - 1; n++) await observe(memory, cells.slice(n, n + 2));
  const f = perceptionPublication(memory), before = structuredClone(memory.records), writes = memory.writes.length; f.republish();
  memory.reads.length = 0;
  const get = vi.fn(f.pages.get), witness = vi.fn(f.pages.witness), savedSnapshot = vi.fn(f.pages.savedSnapshot);
  await expect(inspectMaze({ ...f.pages, get, witness, savedSnapshot }, f.snapshot, f.ref, { scope: 'connections', spaceId: 'origin' }))
    .rejects.toThrow(/(perception|graph) read budget exhausted/);
  const reads = get.mock.calls.length + witness.mock.calls.length + savedSnapshot.mock.calls.length;
  expect(reads).toBeLessThanOrEqual(256); expect(memory.records).toEqual(before); expect(memory.writes).toHaveLength(writes);
  console.info(`connections fragmented refusal: ${reads} public-wrapper reads`);
});

it('refuses reader output beyond cursor/observation bounds rather than truncating it', async () => {
  const memory = graphFixture(); await observe(memory, chain()); const f = perceptionPublication(memory);
  const page = await listRoomConnections(memory.pages, memory.checkpoint(), { level: 1, spaceId: 'origin', limit: 1 });
  // The pure public serializer also bounds the reader-produced token; no wider fallback format.
  const { roomConnectionsObservation } = await import('./roomConnectionsObservation');
  const { perceptionContext } = await import('./context');
  const c = await perceptionContext(f.pages, f.snapshot, f.ref);
  const huge = { ...page, next: 'x'.repeat(769) };
  const module = await import('../../../persistence/canonical/knowledge/graph.roomConnections');
  const spy = vi.spyOn(module, 'listRoomConnections').mockResolvedValue(huge);
  try {
    await expect(roomConnectionsObservation(c, { scope: 'connections', level: 1, spaceId: 'origin' })).rejects.toThrow('cursor');
    spy.mockResolvedValue({ ...page, from: { ...page.from, spaceId: 'x'.repeat(2800) } });
    await expect(roomConnectionsObservation(c, { scope: 'connections', level: 1, spaceId: 'origin' })).rejects.toThrow('2800 bytes');
  } finally { spy.mockRestore(); }
});
