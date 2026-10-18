import { expect, it } from 'vitest';
import { movePosition, opposite } from '../../../domain/maze/movement';
import { earnedCell, knowledgeFixture } from '../knowledge/region.test-support';
import { DIRECTIONS } from '../knowledge/types';
import { planLocalExploration, planScopedApproach } from './explorationPlan';

function grid(side: number) {
  const cells = Array.from({ length: side * side }, (_, i) => {
    const row = Math.floor(i / side), column = i % side, c = earnedCell(row, column, 'room', row, column);
    c.chests = []; return c;
  });
  const byWorld = new Map(cells.map(c => [`${c.world.row}:${c.world.column}`, c]));
  for (const cell of cells) for (const d of DIRECTIONS) {
    const p = movePosition(cell.world, d); cell.edges[d] = byWorld.get(`${p.row}:${p.column}`)?.at ?? null;
  }
  return cells;
}
it('routes across open-room grid junctions without treating them as decisions', async () => {
  const f = knowledgeFixture(), cells = grid(9), target = cells.at(-1)!;
  delete target.edges.east; await f.observe(cells);
  const plan = await planLocalExploration(f.pages, f.checkpoint(), 'room');
  expect(plan?.target).toEqual(target.at); expect(plan?.route).toHaveLength(16);
  expect(plan?.route.every(step => step.to.cell.spaceId === 'room')).toBe(true);
  expect(f.reads.some(k => k.startsWith('dungeon'))).toBe(false);
});
it('chooses a nearer earned unresolved boundary, not a reward or hidden coordinate', async () => {
  const f = knowledgeFixture(), cells = grid(7); delete cells[6].edges.east; delete cells[42].edges.south;
  await f.observe(cells);
  expect((await planLocalExploration(f.pages, f.checkpoint(), 'room'))?.target).toEqual(cells[6].at);
  cells[42].chests = [{ id: 'reward', opened: false }]; await f.observe(cells);
  expect((await planLocalExploration(f.pages, f.checkpoint(), 'room'))?.target).toEqual(cells[6].at);
});
it('can backtrack on earned cells to an unresolved local branch', async () => {
  const f = knowledgeFixture(), cells = grid(7); delete cells[0].edges.west;
  await f.observe([cells[48], ...cells.slice(0, 48)]);
  const plan = await planLocalExploration(f.pages, f.checkpoint(), 'room');
  expect(plan?.target).toEqual(cells[0].at); expect(plan?.route.length).toBe(12);
});
it('does not leave the selected space for a shortcut or claim empty scope is a mapped floor', async () => {
  const f = knowledgeFixture(), cells = grid(3); await f.observe(cells);
  expect(await planLocalExploration(f.pages, f.checkpoint(), 'room')).toBeNull();
  expect(await planLocalExploration(f.pages, f.checkpoint(), 'another-room')).toBeNull();
  const at = cells[4];
  for (const d of DIRECTIONS) {
    const neighbor = cells.find(c => c.at.cell.row === movePosition(at.at.cell, d).row && c.at.cell.column === movePosition(at.at.cell, d).column);
    if (neighbor) neighbor.edges[opposite(d)] = null;
    at.edges[d] = null;
  }
  await f.observe(cells);
  expect(await planScopedApproach(f.pages, f.checkpoint(), at.at)).toBeNull();
});
