import { describe, expect, it } from 'vitest';
import { earnedCell, knowledgeFixture } from '../knowledge/region.test-support';
import { planDestination, knownStep } from './planner';
import { RETAINED_ROUTE_STEPS } from './types';
import { blockKey } from '../knowledge/keys';

const line = (length: number) => {
  const cells = Array.from({ length }, (_, i) => earnedCell(0, i, i < 10 ? 'entry' : 'next', 0, i < 10 ? i : i - 10));
  cells.forEach((cell, i) => { cell.edges.east = cells[i + 1]?.at ?? null; cell.edges.west = cells[i - 1]?.at ?? null; });
  return cells;
};
describe('retained destination planning', () => {
  it('uses evidence only across rooms and retains at most sixteen next steps', async () => {
    const f = knowledgeFixture(), cells = line(40); await f.observe(cells);
    const plan = await planDestination(f.pages, f.checkpoint(), cells[39].at);
    expect(plan.reason).toBeNull(); expect(plan.route).toHaveLength(RETAINED_ROUTE_STEPS);
    expect(plan.route[9].to.cell.spaceId).toBe('next'); expect(await knownStep(f.pages, f.checkpoint(), plan.route[0])).toBe(true);
    expect(f.reads.every(key => !key.startsWith('dungeon'))).toBe(true);
  });
  it('refuses an unknown cell, disconnected earned cell or cross-floor target without consulting the world', async () => {
    const f = knowledgeFixture(), cells = line(3); cells[1].edges.east = null; cells[2].edges.west = null; await f.observe(cells);
    expect((await planDestination(f.pages, f.checkpoint(), { ...cells[0].at, cell: { spaceId: 'hidden', row: 0, column: 0 } })).reason).toBe('unknown-destination');
    expect((await planDestination(f.pages, f.checkpoint(), cells[2].at)).reason).toBe('route-unavailable');
    expect((await planDestination(f.pages, f.checkpoint(), { ...cells[0].at, level: 2 })).reason).toBe('scope-limit');
  });
  it('does not turn missing/corrupt evidence into a blocked route or fall back to geometry', async () => {
    const f = knowledgeFixture(), cells = line(3); await f.observe(cells);
    const key = blockKey(cells[0].at);
    expect(key).toBeDefined(); f.records.delete(key);
    await expect(planDestination(f.pages, f.checkpoint(), cells[2].at)).rejects.toThrow();
  });
  it('only reports arrival at an earned destination and does not perform interactions', async () => {
    const f = knowledgeFixture(), cells = line(2); await f.observe(cells); const writes = f.writes.length;
    expect(await planDestination(f.pages, f.checkpoint(), cells[0].at)).toEqual({ route: [], reason: 'arrived' });
    expect(f.writes).toHaveLength(writes);
  });
});
