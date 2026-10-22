// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { checkpointJson } from '../game/checkpoint';
import { readCanonical, type CanonicalQuery } from '../read';
import { DEFAULT_QUOTA, type CanonicalSnapshot } from '../types';
import * as graph from './graph';
import { earnedCell, graphFixture } from './graph.test-support';
import { readCanonicalRoomAnchor, readCanonicalRooms, ROOM_MAP_PAGE_SIZE } from './roomMap';

vi.mock('../read', () => ({ readCanonical: vi.fn() }));
let fixture: ReturnType<typeof graphFixture>, snapshot: CanonicalSnapshot;
beforeEach(async () => {
  fixture = graphFixture();
  const cells = Array.from({ length: 6 }, (_, i) => earnedCell(-8, i, `space-${i}`));
  await fixture.observe(cells, cells.map((cell, i) => ({ spaceId: cell.at.cell.spaceId, index: i, kind: i === 1 ? 'passage' : 'room' })));
  snapshot = { generation: 'generation', gameId: 'game', revision: 1,
    roots: { knowledge: 'knowledge', world: 'unread-world', execution: null }, checkpoint: checkpointJson(fixture.checkpoint()) };
  // Only the native transaction is substituted; graph, evidence, memory and classification readers are real.
  vi.mocked(readCanonical).mockImplementation(async (query, options) => {
    if (!options?.snapshot) throw Error('An exact snapshot is required');
    const pinned = structuredClone(options.snapshot);
    options.signal?.throwIfAborted();
    const unavailable = async () => { throw Error('Unexpected canonical query'); };
    const pages: CanonicalQuery = { get: fixture.pages.get, witness: fixture.pages.witness, scan: fixture.pages.scan,
      savedSnapshot: unavailable, sourceReceipt: unavailable, liveOperation: unavailable };
    return { snapshot: pinned, value: await query(pages, pinned),
      head: { ...pinned, schema: 1, status: 'ready', owner: 'owner', epoch: 1, allocations: {},
        quota: { ...DEFAULT_QUOTA, usedBytes: 0, reservedBytes: 0, reservations: 0 } },
      stats: { reads: 0, writes: 0, readBytes: 0, writeBytes: 0 } };
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

it('pages only earned rooms with no writes, scans, world reads, or widened canonical budget', async () => {
  const before = structuredClone(fixture.records), writes = [...fixture.writes], signal = new AbortController().signal;
  const first = await readCanonicalRooms(snapshot, undefined, signal);
  expect(ROOM_MAP_PAGE_SIZE).toBe(4); expect(first.value.items.map(n => n.spaceId)).toEqual(['space-0', 'space-2', 'space-3', 'space-4']);
  expect(first.value.anchor).toEqual(fixture.checkpoint().knowledge);
  const second = await readCanonicalRooms(snapshot, first.value.next, signal);
  expect(second.value.items.map(n => n.spaceId)).toEqual(['space-5']); expect(second.value.next).toBeUndefined();
  expect(vi.mocked(readCanonical).mock.calls[0][1]).toEqual({ snapshot, signal });
  expect(fixture.records).toEqual(before); expect(fixture.writes).toEqual(writes);
  expect(fixture.reads.every(key => key.startsWith('perception/'))).toBe(true);
});

it('revalidates the displayed exact anchor without observing, moving, or modifying evidence', async () => {
  const node = (await readCanonicalRooms(snapshot)).value.items[0], before = structuredClone(fixture.records);
  const result = await readCanonicalRoomAnchor(snapshot, node);
  expect(result.value).toEqual(node.anchor); expect(fixture.records).toEqual(before);
  const changed = structuredClone(node); changed.anchor.world.row++;
  await expect(readCanonicalRoomAnchor(snapshot, changed)).rejects.toThrow('room anchor changed');
  await expect(readCanonicalRoomAnchor(snapshot, { ...node, kind: 'passage' })).rejects.toThrow('foreign room selection');
  await expect(readCanonicalRoomAnchor(snapshot, { ...node, level: 2 })).rejects.toThrow('foreign room selection');
  await expect(readCanonicalRoomAnchor(snapshot, { ...node, spaceId: 'unearned' })).rejects.toThrow('room anchor changed');
});

it('rejects a stale witness or foreign cursor, never falling back to current roots', async () => {
  const page = (await readCanonicalRooms(snapshot)).value;
  await fixture.observe([earnedCell(40, 40, 'new-room')]);
  await expect(readCanonicalRooms(snapshot, page.next)).rejects.toThrow('knowledge namespace');
  snapshot.checkpoint = checkpointJson(fixture.checkpoint()); snapshot.revision++;
  await expect(readCanonicalRooms(snapshot, page.next)).rejects.toThrow('stale or foreign graph cursor');
});

it('forwards cancellation and caps the returned page payload at 4096 bytes', async () => {
  const abort = new AbortController(); abort.abort();
  await expect(readCanonicalRooms(snapshot, undefined, abort.signal)).rejects.toThrow();
  const page = (await readCanonicalRooms(snapshot)).value;
  vi.spyOn(graph, 'listKnownNodes').mockResolvedValueOnce({ ...page, next: 'x'.repeat(4096) });
  await expect(readCanonicalRooms(snapshot)).rejects.toThrow('4096');
});
