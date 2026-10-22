// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { KnownGraphUnavailableError, listKnownLinks, listKnownNodes, readKnownAnchor } from '../../../persistence/canonical/knowledge/graph';
import type { KnownAnchor, KnownNode } from '../../../persistence/canonical/knowledge/graph';
import { jsonBytes } from '../../../persistence/canonical/validation';
import { inspectMaze } from './observation';
import { perceptionFixture } from './observation.test-support';
import { graphCursor } from '../../../persistence/canonical/knowledge/graph.cursor';

vi.mock('../../../persistence/canonical/knowledge/graph', async importOriginal => ({
  ...await importOriginal<typeof import('../../../persistence/canonical/knowledge/graph')>(),
  listKnownLinks: vi.fn(), listKnownNodes: vi.fn(), readKnownAnchor: vi.fn(),
}));
beforeEach(() => vi.clearAllMocks());
const anchor = (spaceId: string): KnownAnchor => ({ at: { level: 1, cell: { spaceId, row: 3, column: 5 } },
  world: { row: -24, column: 90 }, source: { sequence: 1, id: 'original-source', index: 0 } });

it('returns room identities and earned anchors only, with bounded publication-bound pages', async () => {
  const f = await perceptionFixture(), knowledge = f.knowledge.checkpoint().knowledge!;
  const nodes: KnownNode[] = ['room-a', 'room-b'].map(spaceId => ({ level: 1, spaceId, kind: 'room', anchor: anchor(spaceId) }));
  const next = graphCursor(knowledge, { scope: 'nodes', level: 1, kind: 'room' }, { spaceId: 'room-b', ordinal: 2 });
  vi.mocked(listKnownNodes).mockResolvedValueOnce({ anchor: knowledge, items: nodes, next })
    .mockResolvedValueOnce({ anchor: knowledge, items: [] });
  const first = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'map' });
  expect(first.data.rooms).toEqual(nodes); expect(first.data).not.toHaveProperty('cells');
  expect(listKnownNodes).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), { level: 1, kind: 'room', limit: 2 });
  const cursor = first.data.next as string;
  await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'map', cursor });
  expect(listKnownNodes).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), { level: 1, kind: 'room', limit: 2, cursor: next });
  expect(jsonBytes(first)).toBeLessThanOrEqual(2800); expect(listKnownLinks).not.toHaveBeenCalled();
  f.republish();
  await expect(inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'map', cursor })).rejects.toThrow('foreign');
  expect(listKnownNodes).toHaveBeenCalledTimes(2);
});

it('requests connections only for the explicitly selected remembered space', async () => {
  const f = await perceptionFixture(), knowledge = f.knowledge.checkpoint().knowledge!;
  const from = anchor('distant'), to = anchor('passage');
  const link = { id: 'a'.repeat(64), from, to, direction: 'east' as const };
  vi.mocked(readKnownAnchor).mockResolvedValue(from);
  vi.mocked(listKnownLinks).mockResolvedValue({ anchor: knowledge, items: [link] });
  const view = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'links', level: 1, spaceId: 'distant' });
  expect(view.data).toEqual({ scope: 'links', space: { level: 1, spaceId: 'distant' }, links: [link] });
  expect(listKnownLinks).toHaveBeenCalledWith(expect.anything(), expect.anything(), { level: 1, spaceId: 'distant', limit: 1 });
  expect(listKnownNodes).not.toHaveBeenCalled(); expect(jsonBytes(view)).toBeLessThanOrEqual(2800);
});

it('keeps unknown targets opaque and never turns corruption into an empty graph', async () => {
  const f = await perceptionFixture(); vi.mocked(readKnownAnchor).mockResolvedValue(null);
  const view = (spaceId: string) => inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'links', spaceId });
  expect(await view('unseen')).toEqual(await view('nonexistent')); expect(listKnownLinks).not.toHaveBeenCalled();
  vi.mocked(readKnownAnchor).mockRejectedValue(new KnownGraphUnavailableError());
  expect((await view('room')).data).toEqual({ scope: 'links', state: 'unavailable' });
  vi.mocked(readKnownAnchor).mockRejectedValue(new Error('corrupt graph source'));
  await expect(view('room')).rejects.toThrow('corrupt graph source');
});
