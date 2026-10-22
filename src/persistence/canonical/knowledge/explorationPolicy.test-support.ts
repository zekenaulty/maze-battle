import { earnedCell, knowledgeFixture } from './region.test-support';
import { compareExplorationObservation } from './explorationPolicy';
import type { ObservedCell } from './types';

export const floorCell = (column = 0, spaceId = 'room'): ObservedCell =>
  ({ ...earnedCell(0, column, spaceId, 0, column), edges: {}, chests: [] });
export async function comparison(prior: ObservedCell[], current: ObservedCell[], history?: ObservedCell[]) {
  const f = knowledgeFixture();
  if (history) await f.observe(history);
  await f.observe(prior); f.reads.length = f.writes.length = 0;
  const cells = structuredClone(current);
  return { before: f, cells, read: () => compareExplorationObservation(f.pages, f.checkpoint(), cells, 'room') };
}
