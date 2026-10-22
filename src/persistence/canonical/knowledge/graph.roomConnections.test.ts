// @vitest-environment node
import { expect, it } from 'vitest';
import { listRoomConnections } from './graph.roomConnections';
import { cell, chain, graphFixture, join, meter, observe, roomScope } from './graph.roomConnections.test-support';
import { blockKey, observationKey } from './keys';
import { nodeKey } from './graph.records';
import { knowledgeFixture } from './region.test-support';

it('returns a direct room edge and stops at that room without expanding its other exits', async () => {
  const f = graphFixture(), cells = [cell(0, 0, 'origin'), cell(0, 1, 'target'), cell(0, 2, 'beyond')];
  join(cells[0], cells[1]); join(cells[1], cells[2]); await observe(f, cells, ['origin', 'target', 'beyond']);
  const before = structuredClone(f.records), m = meter(f.pages), page = await listRoomConnections(m.pages, f.checkpoint(), roomScope);
  expect(page.state).toBe('complete'); expect(page.items.map(c => c.room.spaceId)).toEqual(['target']);
  expect(page.items[0].proof).toMatchObject({ steps: 1, crossings: 1, digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/) });
  expect(page.items[0].room.anchor.source.sequence).toBe(1);
  expect(m.keys).not.toContain(`knowledge:${nodeKey(1, 'beyond')}`);
  expect(f.records).toEqual(before); expect(m.counts().reads).toBeLessThan(256);
});

it('collapses two multi-cell passages using earned classifications rather than space ID names', async () => {
  const f = graphFixture(), cells = chain(); await observe(f, cells);
  const first = await listRoomConnections(f.pages, f.checkpoint(), roomScope);
  expect(first.items.map(c => c.room.spaceId)).toEqual(['target']);
  expect(first.items[0].proof).toMatchObject({ steps: 5, crossings: 3 });
  expect(JSON.stringify(first)).not.toContain('room-label');
  expect(first.state).toBe('complete'); expect(first.next).toBeUndefined();
  await observe(f, cells);
  expect((await listRoomConnections(f.pages, f.checkpoint(), roomScope)).items).toEqual(first.items);
});

it('terminates a passage cycle, deduplicates rooms and retains both observed branches', async () => {
  const f = graphFixture(), a = cell(0, 0, 'origin'), p = cell(0, 1, 'p'), q = cell(0, 2, 'q');
  const r = cell(1, 2, 'r'), s = cell(1, 1, 's'), east = cell(0, 3, 'east'), south = cell(2, 1, 'south');
  join(a, p); join(p, q); join(q, r, 'south'); join(r, s, 'west'); join(s, p, 'north'); join(q, east); join(s, south, 'south');
  await observe(f, [a, p, q, r, s, east, south], ['origin', 'east', 'south']);
  const m = meter(f.pages), page = await listRoomConnections(m.pages, f.checkpoint(), roomScope);
  expect(page.items.map(c => c.room.spaceId)).toEqual(['east', 'south']); expect(page.state).toBe('complete');
  expect(m.counts().reads).toBeLessThanOrEqual(256); expect(m.counts().bytes).toBeLessThan(1024 * 1024);
});

it('does not jump between separately observed ends of the same passage across an unseen gap', async () => {
  const f = graphFixture(), cells = chain(1, 5);
  await observe(f, cells.slice(0, 3)); await observe(f, cells.slice(4));
  await observe(f, [cell(30, 30, 'away')], ['away']); const m = meter(f.pages);
  const page = await listRoomConnections(m.pages, f.checkpoint(), roomScope);
  expect(page).toMatchObject({ state: 'partial', reason: 'unseen-passage', items: [] }); expect(page.next).toBeUndefined();
  expect(m.keys).not.toContain(`knowledge:${nodeKey(1, 'target')}`);
  expect(m.keys.some(k => k.includes(observationKey(2)))).toBe(false);
});

it.each(['passage', 'room', 'internal'])('honors an observed %s closure without refreshing the unseen opposite cell', async where => {
  const f = graphFixture(), cells = chain(); await observe(f, cells);
  const historical = knowledgeFixture({ records: f.records, checkpoint: f.checkpoint() });
  const original = await listRoomConnections(historical.pages, historical.checkpoint(), roomScope);
  const index = where === 'room' ? cells.length - 1 : where === 'internal' ? 1 : cells.length - 2;
  const closed = structuredClone(cells[index]), direction = where === 'room' ? 'west' : 'east';
  closed.edges[direction] = null;
  const oppositeCell = cells[where === 'room' ? index - 1 : index + 1];
  const prior = structuredClone(f.records.get(blockKey(oppositeCell.at)));
  await observe(f, [closed]);
  // Internal endpoints may share a block; compare only the unseen cell in that case.
  const oldValue = prior!.value as { cells: Record<string, unknown> }, newValue = f.records.get(blockKey(oppositeCell.at))!.value as typeof oldValue;
  const key = `${oppositeCell.at.cell.row}:${oppositeCell.at.cell.column}`;
  expect(newValue.cells[key]).toEqual(oldValue.cells[key]);
  await observe(f, [cell(30, 30, 'away')], ['away']);
  expect((await listRoomConnections(f.pages, f.checkpoint(), roomScope)).items).toEqual([]);
  expect(await listRoomConnections(historical.pages, historical.checkpoint(), roomScope)).toEqual(original);
});

it('returns a complete empty earned component distinctly from an unseen passage gap', async () => {
  const f = graphFixture(); await observe(f, [cell(0, 0, 'origin')]);
  expect(await listRoomConnections(f.pages, f.checkpoint(), roomScope)).toMatchObject({ state: 'complete', items: [] });
});
