import { expect, it } from 'vitest';
import { asyncLinkedVision } from '../../../domain/maze/linkedVision';
import { movePosition } from '../../../domain/maze/movement';
import { earnedCell, knowledgeFixture } from './region.test-support';
import { readKnowledgeRoom } from './roomView';
import { cellKey } from './keys';
import { DIRECTIONS, MAX_VISIBLE_CELLS, VISION_RADIUS, type ObservedCell } from './types';
import type { WorldPosition } from '../world/types';
import { autoFixture, quest } from '../auto/auto.test-support';
import { planAutoRoute } from '../auto/planner';

const at = (row: number, column: number): WorldPosition => ({ level: 1, cell: { spaceId: 'large', row, column } });
const inside = (p: WorldPosition) => p.cell.row >= 1 && p.cell.row <= 13 && p.cell.column >= 1 && p.cell.column <= 13;
async function sight(actor: WorldPosition): Promise<ObservedCell[]> {
  const positions = await asyncLinkedVision(actor, VISION_RADIUS, cellKey, async p => DIRECTIONS
    .map(d => ({ level: 1, cell: { ...p.cell, ...movePosition(p.cell, d) } })).filter(inside), MAX_VISIBLE_CELLS);
  const visible = new Set(positions.map(cellKey));
  return positions.map(p => {
    const cell = earnedCell(p.cell.row, p.cell.column, 'large', p.cell.row, p.cell.column); cell.chests = [];
    for (const d of DIRECTIONS) {
      const target = { level: 1, cell: { ...p.cell, ...movePosition(p.cell, d) } };
      if (!inside(target)) cell.edges[d] = null;
      else if (visible.has(cellKey(target))) cell.edges[d] = target;
      else delete cell.edges[d];
    }
    return cell;
  });
}

it('keeps radius-cropped frontiers unknown and resolves them only through subsequent earned sight', async () => {
  const f = knowledgeFixture(), first = await sight(at(7, 7));
  expect(first.length).toBeLessThan(169); expect(first.length).toBeLessThanOrEqual(MAX_VISIBLE_CELLS);
  await f.observe(first); const before = await readKnowledgeRoom(f.pages, f.checkpoint());
  expect(before.frontiers.length).toBeGreaterThan(0); expect(before.cells).toHaveLength(first.length);
  expect(before.frontiers.every(c => DIRECTIONS.some(d => !c.edges[d]))).toBe(true);
  const auto = autoFixture(); auto.state.lastPosition = f.checkpoint().position; auto.state.rootId = 'large'; auto.room.spaceId = 'large';
  auto.state.objective = { id: 'guild-target', kind: 'quest', roomId: 'unearned-room' };
  auto.guild.active = [quest('guild-target', 'unearned-room')];
  await planAutoRoute(auto.pages, f.checkpoint(), auto.state, auto.room, before, auto.guild);
  expect(auto.state.route?.steps).toHaveLength(VISION_RADIUS);
  expect(before.frontiers.some(c => cellKey(c.at) === cellKey(auto.state.route!.target))).toBe(true);
  expect(auto.state.route!.steps.every(s => before.cells.some(c => cellKey(c.at) === cellKey(s.to)))).toBe(true);
  expect(auto.reads).toEqual(['auto/room/1/unearned-room']); expect(auto.room.closed).toBe(false);
  const unknown = first.flatMap(c => DIRECTIONS.filter(d => !Object.hasOwn(c.edges, d)).map(direction => ({ at: c.at, direction })));
  expect(unknown.length).toBeGreaterThan(0);
  for (const [row, column] of [[1, 1], [1, 13], [13, 13], [13, 1], [7, 7]]) {
    const cells = await sight(at(row, column)); expect(cells.length).toBeLessThanOrEqual(MAX_VISIBLE_CELLS); await f.observe(cells);
  }
  const after = await readKnowledgeRoom(f.pages, f.checkpoint());
  expect(after.cells).toHaveLength(169); expect(after.frontiers).toEqual([]);
  for (const edge of unknown) expect(after.cells.find(c => cellKey(c.at) === cellKey(edge.at))?.edges[edge.direction]?.target).toBeTruthy();
  expect(f.reads.every(k => k.startsWith('perception/'))).toBe(true); expect(after.exits).toEqual([]);
});
