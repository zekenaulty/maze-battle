// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isCurrentFrontier } from '../../../persistence/canonical/knowledge/frontiers';
import { earnedCell } from '../../../persistence/canonical/knowledge/region.test-support';
import { jsonBytes } from '../../../persistence/canonical/validation';
import { inspectMaze } from './observation';
import { perceptionFixture } from './observation.test-support';
import { encodeFrontier, parseFrontier } from './frontierSelection';
import { inspectionCursor, inspectArgs, localPosition } from './validation';
import type { CellAddress } from './types';
import type { FrontierSelection } from '../../../persistence/canonical/knowledge/frontiers';

const cells = (spaceId = 'room') => Array.from({ length: 8 }, (_, i) => ({ ...earnedCell(i * 2, -i * 2, spaceId, i, i), edges: {} }));
describe('bounded canonical frontier queries', () => {
  it('pages every current selection exactly once with source and original-publication token, within byte/read bounds', async () => {
    const f = await perceptionFixture(cells()), found: FrontierSelection[] = []; let cursor: string | undefined;
    f.knowledge.writes.length = 0;
    for (let i = 0; i < 40; i++) {
      f.knowledge.reads.length = 0;
      const result = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'frontiers', ...(cursor ? { cursor } : {}) });
      expect(jsonBytes(result)).toBeLessThanOrEqual(2800); expect(f.knowledge.reads.length).toBeLessThanOrEqual(256);
      const page = result.data.frontiers as (Omit<FrontierSelection, 'at'> & { at: CellAddress; frontier: string })[];
      expect(page.length).toBeGreaterThan(0); expect(page.length).toBeLessThanOrEqual(4);
      for (const { frontier, at, ...rest } of page) {
        const selection = { ...rest, at: localPosition(at) };
        expect(parseFrontier(frontier, f.ref)).toEqual(selection); expect(frontier).toBe(encodeFrontier(f.ref, selection)); found.push(selection);
      }
      cursor = result.data.next as string | undefined; if (!cursor) break;
    }
    expect(cursor).toBeUndefined(); expect(found).toHaveLength(28); expect(new Set(found.map(s => JSON.stringify(s))).size).toBe(28);
    expect(await isCurrentFrontier(f.pages, f.knowledge.checkpoint(), found[0])).toBe(true);
    expect(f.knowledge.writes).toEqual([]);
  });
  it('byte-fits pages with maximal generated publication and room IDs', async () => {
    const long = 'x'.repeat(128), f = await perceptionFixture(cells(long));
    f.ref.key = `agentica/publications/${long}`; f.ref.id = long;
    f.publication.sourceAttemptId = f.publication.sourceRequest.attemptId = long;
    let cursor: string | undefined, count = 0;
    for (let i = 0; i < 40; i++) {
      const result = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'frontiers', ...(cursor ? { cursor } : {}) });
      expect(jsonBytes(result)).toBeLessThanOrEqual(2800); count += (result.data.frontiers as unknown[]).length;
      cursor = result.data.next as string | undefined; if (!cursor) break;
    }
    expect(cursor).toBeUndefined(); expect(count).toBe(28);
  });
  it('rejects foreign scope/publication, out-of-range and noninteger cursors', async () => {
    const f = await perceptionFixture(cells()), first = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'frontiers' });
    const cursor = first.data.next as string;
    await expect(inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'room', cursor })).rejects.toThrow('cursor');
    for (const after of [0, -1, 0.5, 28, 452, '1']) {
      const bad = inspectionCursor(f.ref, { scope: 'frontiers', level: 1 }, after);
      await expect(inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'frontiers', cursor: bad })).rejects.toThrow('cursor');
    }
    f.republish(); await expect(inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'frontiers', cursor })).rejects.toThrow('cursor');
  });
  it('returns honest empty current sight without clearance/completion claims, but refuses unavailable sight', async () => {
    const f = await perceptionFixture();
    expect((await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'frontiers' })).data).toEqual({ scope: 'frontiers', frontiers: [] });
    f.snapshot.checkpoint.mode = f.publication.snapshot.checkpoint.mode = 'town';
    await expect(inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'frontiers' })).rejects.toThrow('unavailable');
  });
  it.each([{ level: 1 }, { spaceId: 'room' }, { row: 0, column: 0 }, { target: 'room' },
    { cursor: 'x'.repeat(1025) }, { cursor: null }])('frontiers accepts only scope and bounded cursor %j', args => {
    expect(() => inspectArgs({ scope: 'frontiers', ...args })).toThrow();
  });
});
