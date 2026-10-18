// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { earnedCell } from '../../../persistence/canonical/knowledge/region.test-support';
import type { CellSource } from '../../../persistence/canonical/knowledge/types';
import { jsonBytes } from '../../../persistence/canonical/validation';
import { chestArgs, resolveChestSelection } from './chestSelection';
import { inspectMaze, observeMaze } from './observation';
import { perceptionFixture } from './observation.test-support';
import type { CellAddress } from './types';

interface ProjectedCell { at: CellAddress; source: CellSource; state: string; chests: { id: string; opened: boolean; target?: string }[] }
const at = { level: 1, spaceId: 'room', row: 0, column: 0 };
describe('explicit current-tile chest disclosure', () => {
  it('adds only a target to the current actor tile on explicit cell and room inspection, not initial context or map', async () => {
    const actor = earnedCell(), neighbor = earnedCell(-4, -2, 'room', 1, 0), f = await perceptionFixture([actor, neighbor]);
    const initial = await observeMaze(f.pages, f.snapshot, f.ref), map = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'map' });
    expect(JSON.stringify(initial)).not.toContain('target'); expect(JSON.stringify(initial)).not.toContain('chest');
    expect(jsonBytes(initial)).toBeLessThanOrEqual(768); expect(JSON.stringify(map)).not.toContain('target');
    const view = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'cell', ...at }), cell = view.data.cell as unknown as ProjectedCell;
    expect(cell).toMatchObject({ at, state: 'visible', chests: [{ id: 'chest', opened: false, target: expect.any(String) }] });
    const selected = chestArgs({ target: cell.chests[0].target }, f.ref);
    expect(selected.source).toEqual({ sequence: 1, id: f.knowledge.checkpoint().knowledge!.id, index: 0 });
    expect(await resolveChestSelection(f.pages, f.snapshot, f.ref, selected)).toEqual({
      command: { kind: 'open-chest', chestId: 'chest' }, position: actor.at,
    });
    const room = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'room' });
    expect((room.data.cells as unknown as ProjectedCell[])[0]).toEqual(cell);
    const other = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'cell', ...at, row: 1 });
    expect((other.data.cell as unknown as ProjectedCell).chests).toEqual(neighbor.chests);
    expect(jsonBytes(view)).toBeLessThanOrEqual(2800);
  });
  it('keeps original fact fields while the target pins renewed current sight', async () => {
    const f = await perceptionFixture(), old = f.knowledge.checkpoint().knowledge!;
    await f.knowledge.observe([earnedCell()]); f.republish();
    const view = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'cell', ...at }), cell = view.data.cell as unknown as ProjectedCell;
    expect(cell.source).toEqual({ sequence: old.sequence, id: old.id, index: 0 });
    const selected = chestArgs({ target: cell.chests[0].target }, f.ref), current = f.knowledge.checkpoint().knowledge!;
    expect(selected.source).toEqual({ sequence: current.sequence, id: current.id, index: 0 });
    expect(await resolveChestSelection(f.pages, f.snapshot, f.ref, selected)).not.toBeNull();
  });
  it.each(['opened', 'remembered', 'town'])('withholds targets for %s chests', async kind => {
    const cell = earnedCell(); if (kind === 'opened') cell.chests[0].opened = true;
    const f = await perceptionFixture([cell]);
    if (kind === 'remembered') { await f.knowledge.observe([earnedCell(-3, -2, 'elsewhere')]); f.republish(); }
    if (kind === 'town') { f.snapshot.checkpoint.mode = 'town'; f.publication.snapshot.checkpoint.mode = 'town'; }
    const view = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'cell', ...at });
    expect((view.data.cell as unknown as ProjectedCell).chests).toEqual(cell.chests);
    const room = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'room', ...at });
    for (const visible of room.data.cells as unknown as ProjectedCell[])
      for (const chest of visible.chests) expect(chest).not.toHaveProperty('target');
  });
  it('preserves byte-bounded room pagination with a token on exactly one actor cell', async () => {
    const cells = Array.from({ length: 16 }, (_, column) => earnedCell(-4, column - 8, 'room', 0, column));
    const f = await perceptionFixture(cells), found: ProjectedCell[] = []; let cursor: string | undefined;
    for (let i = 0; i < 32; i++) {
      const view = await inspectMaze(f.pages, f.snapshot, f.ref, { scope: 'room', ...(cursor ? { cursor } : {}) });
      expect(jsonBytes(view)).toBeLessThanOrEqual(2800); found.push(...view.data.cells as unknown as ProjectedCell[]);
      cursor = view.data.next as string | undefined; if (!cursor) break;
    }
    expect(cursor).toBeUndefined(); expect(found).toHaveLength(16);
    const targets = found.flatMap(cell => cell.chests.flatMap(chest => chest.target ? [chest.target] : []));
    expect(targets).toHaveLength(1); expect(chestArgs({ target: targets[0] }, f.ref).source.index).toBe(0);
    expect(new Set(found.map(cell => JSON.stringify(cell.at))).size).toBe(16);
    expect(f.knowledge.reads.every(key => key.startsWith('perception/'))).toBe(true);
  });
});
