import { same } from '../../src/persistence/canonical/world/records';
import type { FrontierSelection } from '../../src/persistence/canonical/knowledge/frontiers';
import * as knowledge from './canonical-knowledge-fixture';
import { query } from './canonical-frontier.support';

export async function readExplorationFrame() {
  const observed = await knowledge.current(), page = await query(observed.snapshot);
  return { sight: observed.value, frontiers: page.value, accesses: page.accesses };
}
export type ExplorationFrame = Awaited<ReturnType<typeof readExplorationFrame>>;

// Public observation only: no layout import, seed, variant, desired coordinate, or world accessor.
export function selectUnopenedObjectFrontier(frame: ExplorationFrame): FrontierSelection {
  const candidates = frame.frontiers.filter(frontier => frame.sight.cells.some(cell => same(cell.at, frontier.at)
    && cell.chests.some(chest => !chest.opened)));
  if (candidates.length !== 1) throw Error('Expected one earned unresolved direction at the newly observed chest');
  return structuredClone(candidates[0]);
}

/** Retain raw frames alongside this comparison; only fresh record IDs and the wall clock are normalized. */
export function explorationComparison() {
  const roles = new Map<string, string>(), identities = new Map<string, string>();
  function identity(id: string, role: string) {
    if ((roles.has(role) && roles.get(role) !== id) || (identities.has(id) && identities.get(id) !== role))
      throw Error('Observation identity alias or replacement in A/B transcript');
    roles.set(role, id); identities.set(id, role); return role;
  }
  return (frame: ExplorationFrame) => {
    const { header, cells } = frame.sight;
    return { sight: { header: { ...header, observedAt: '<wall-clock>',
      previous: header.previous && { ...header.previous,
        id: identity(header.previous.id, `observation-${header.previous.sequence}`) },
      chunks: header.chunks.map((id, i) => identity(id, `chunk-${header.sequence}-${i}`)) }, cells },
    frontiers: frame.frontiers.map(frontier => ({ ...frontier, source: { ...frontier.source,
      id: identity(frontier.source.id, `observation-${frontier.source.sequence}`) } })) };
  };
}
