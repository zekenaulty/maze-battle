// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { earnedCell } from '../../../persistence/canonical/knowledge/region.test-support';
import { jsonBytes } from '../../../persistence/canonical/validation';
import { launchStart } from '../../../persistence/canonical/agentica/launch.wire';
import { launchStartFixture } from '../../../persistence/canonical/agentica/launch.test-support';
import { protocolAction, protocolResult } from '../../../persistence/canonical/agentica/types.test-support';
import { mazeCapabilities } from './capabilities';
import { inspectMaze, observeMaze } from './observation';
import { perceptionFixture } from './observation.test-support';
import { inspectArgs } from './validation';
import type { InspectArgs } from './types';

describe('canonical scoped Agentica perception', () => {
  it('initial actor/source plus all opt-in capabilities fit the launch start bound', async () => {
    const f = await perceptionFixture(), view = await observeMaze(f.pages, f.snapshot, f.ref);
    expect(view.observationId).toBe(f.ref.id); expect(view.revision).toBe(f.publication.wireRevision);
    expect(await observeMaze(f.pages, { ...f.snapshot, revision: f.snapshot.revision + 1,
      roots: { ...f.snapshot.roots, execution: 'bookkeeping' } }, f.ref)).toEqual(view);
    expect(view.data).not.toHaveProperty('cells'); expect(view.data).not.toHaveProperty('rooms'); expect(jsonBytes(view)).toBeLessThanOrEqual(768);
    const start = { ...launchStartFixture(view.revision), observation: view, capabilities: mazeCapabilities() };
    expect(() => launchStart(start)).not.toThrow(); expect(jsonBytes(start)).toBeLessThanOrEqual(3584);
    expect(start.capabilities.map(c => c.id)).toEqual(['maze.observe', 'maze.inspect', 'maze.navigate', 'maze.explore', 'maze.interact']);
    start.capabilities[0].name = 'mutated'; expect(mazeCapabilities()[0].name).toBe('Observe');
  });
  it('includes compact visible town/down stairways and exact sight sources in the initial observation', async () => {
    const entry = earnedCell(-5, -2, 'entry', 2, 3), exit = earnedCell(-4, -2, 'exit', 1, 2);
    entry.stairs = ['town']; exit.stairs = ['down']; exit.chests[0].id = 'visible-chest-not-in-initial-summary';
    const f = await perceptionFixture([entry, exit]), view = await observeMaze(f.pages, f.snapshot, f.ref), { sequence, id } = f.knowledge.checkpoint().knowledge!;
    expect(view.data.stairways).toEqual([
      { direction: 'town', at: { level: 1, ...entry.at.cell }, targetLevel: 'town', destinationKind: 'town', source: { sequence, id, index: 0 } },
      { direction: 'down', at: { level: 1, ...exit.at.cell }, targetLevel: 2, destinationKind: 'landing-room', source: { sequence, id, index: 1 } },
    ]);
    expect(view.data).not.toHaveProperty('moreStairways'); expect(view.data).not.toHaveProperty('cells');
    expect(JSON.stringify(view)).not.toMatch(/visible-chest-not-in-initial-summary|destinationRoomId|"target":|contents/);
    expect(jsonBytes(view)).toBeLessThanOrEqual(768);
    expect(() => launchStart({ ...launchStartFixture(view.revision), observation: view, capabilities: mazeCapabilities() })).not.toThrow();
    expect(f.knowledge.reads.every(key => key.startsWith('perception/'))).toBe(true);
  });
  it('caps synthetic extra visible stairs within initial context bounds and drops out-of-sight hints', async () => {
    const cells = Array.from({ length: 8 }, (_, column) => {
      const cell = earnedCell(0, column, 'room', 0, column); cell.chests = []; cell.stairs = ['down']; return cell;
    });
    const f = await perceptionFixture(cells), first = await observeMaze(f.pages, f.snapshot, f.ref);
    expect(first.data.stairways).toHaveLength(2); expect(first.data.moreStairways).toBe(true); expect(jsonBytes(first)).toBeLessThanOrEqual(768);
    const old = { ...f.ref }, fresh = earnedCell(20, 20, 'elsewhere'); fresh.chests = [];
    await f.knowledge.observe([fresh]); f.republish();
    await expect(observeMaze(f.pages, f.snapshot, old)).rejects.toThrow('reference');
    const next = await observeMaze(f.pages, f.snapshot, f.ref);
    expect(next.data).not.toHaveProperty('stairways'); expect(next.data).not.toHaveProperty('moreStairways');
    expect((await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'objects' })).data.objects).toEqual([]);
  });
  it('returns signed earned coordinates and preserves original cell and edge sources without refreshing sight', async () => {
    const f = await perceptionFixture(), original = f.knowledge.checkpoint().knowledge!;
    await f.knowledge.observe([earnedCell()]); f.republish();
    const args = { scope: 'cell' as const, level: 1, spaceId: 'room', row: 0, column: 0 }, view = await inspectMaze(f.pages, f.snapshot, f.ref, args);
    expect(view.data.cell).toMatchObject({ world: { row: -5, column: -2 }, state: 'visible', source: { sequence: 1, id: original.id, index: 0 },
      edges: { north: { target: null, source: { id: original.id, sequence: 1 } } }, chests: [{ id: 'chest', opened: false }] });
    expect(view.data.sources).toEqual([{ sequence: 1, id: original.id, revision: 1, observedAt: '2026-10-13T00:00:00.000Z' }]);
    expect(jsonBytes({ ...protocolResult(protocolAction(view.revision)), observation: view })).toBeLessThanOrEqual(4096);
  });
  it('unknown targets are opaque and cannot become generated-world guidance', async () => {
    const f = await perceptionFixture();
    const query = (spaceId: string) => inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'cell', level: 1, spaceId, row: 1, column: 1 });
    expect(await query('undiscovered')).toEqual(await query('nonexistent'));
    expect((await query('room')).data).toEqual({ scope: 'cell', state: 'unknown' });
    expect(f.knowledge.reads.every(k => k.startsWith('perception/'))).toBe(true);
  });
  it('room pages cover only a query window and preserve cells across byte-budget pagination', async () => {
    const cells = Array.from({ length: 16 }, (_, column) => earnedCell(-4, column - 8, 'room', 0, column));
    const f = await perceptionFixture(cells), found: unknown[] = []; let cursor: string | undefined;
    for (let i = 0; i < 32; i++) {
      const view = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'room', ...(cursor ? { cursor } : {}) });
      expect(jsonBytes(view)).toBeLessThanOrEqual(2800); found.push(...view.data.cells as unknown[]); cursor = view.data.next as string | undefined;
      if (!cursor) break;
    }
    expect(cursor).toBeUndefined(); expect(found).toHaveLength(16);
    expect(new Set(found.map(c => JSON.stringify(c))).size).toBe(16);
  });
  it('unclassified history is explicitly unavailable, not silently promoted into a room graph', async () => {
    const f = await perceptionFixture();
    for (let n = 0; n < 7; n++) await f.knowledge.observe([earnedCell(n, -n, `known-${n}`)]);
    f.republish();
    const view = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'map' });
    expect(view.data).toEqual({ scope: 'map', state: 'unavailable' });
    expect(jsonBytes(view)).toBeLessThanOrEqual(2800);
  });
  it('rejects stale cursors, changed scopes, mismatched snapshots and replaced publications', async () => {
    const f = await perceptionFixture(), room = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'room' }), cursor = room.data.next as string;
    await expect(inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'room', row: 1, column: 1, cursor })).rejects.toThrow('cursor');
    const old = { ...f.ref }; f.republish();
    await expect(inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'room', cursor })).rejects.toThrow('cursor');
    await expect(observeMaze(f.pages, f.snapshot, old)).rejects.toThrow('reference');
    await expect(observeMaze(f.pages, { ...f.snapshot, roots: { ...f.snapshot.roots, knowledge: 'other' } }, f.ref)).rejects.toThrow('snapshot');
  });
  it('captures arguments, snapshot and publication before awaiting any source read', async () => {
    const f = await perceptionFixture(), args: InspectArgs = { scope: 'cell', level: 1, spaceId: 'room', row: 0, column: 0 };
    const work = inspectMaze(f.pages, f.snapshot, f.ref, args); args.row = 999; f.snapshot.checkpoint.mode = 'town';
    f.ref.id = 'changed';
    expect((await work).data.cell).toMatchObject({ at: { row: 0 }, state: 'visible' });
  });
  it('room pages make bounded point reads independent of unrelated remembered rooms', async () => {
    const f = await perceptionFixture();
    for (let n = 0; n < 64; n++) await f.knowledge.observe([earnedCell(n, n, `unrelated-${n}`)]);
    f.republish(); f.knowledge.reads.length = 0;
    await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'room', level: 1, spaceId: 'room' });
    const memoryReads = f.knowledge.reads.filter(key => key.startsWith('perception/cell/'));
    expect(memoryReads.filter(key => !key.endsWith('/integrity'))).toHaveLength(4);
    expect(memoryReads.filter(key => key.endsWith('/integrity'))).toHaveLength(4);
    expect(f.knowledge.reads.some(key => key.startsWith('perception/cell/1/unrelated-'))).toBe(false);
    expect(f.knowledge.reads.length).toBeLessThanOrEqual(256);
  });
  it.each([{ scope: 'world' }, { scope: 'map', spaceId: 'hidden' }, { scope: 'cell', row: -1 }, { scope: 'room', row: 0 },
    { scope: 'room', column: 999, row: 0 }, { scope: 'map', cursor: 'x'.repeat(1025) }, { scope: 'map', extra: true }])('rejects unbounded or unsupported arguments %j', args => {
    expect(() => inspectArgs(args)).toThrow();
  });
});
