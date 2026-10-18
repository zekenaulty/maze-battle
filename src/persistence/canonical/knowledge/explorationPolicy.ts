import type { Direction } from '../../../domain/types';
import { gameCheckpoint, type GameCheckpoint } from '../game/checkpoint';
import { id } from '../roster/codec';
import { check } from '../validation';
import { same } from '../world/records';
import type { WorldPosition } from '../world/types';
import { explorationView } from './explorationPolicy.read';
import { explorationCells } from './explorationPolicy.cells';
import { DIRECTIONS, type CellSource, type KnowledgeAnchor, type KnowledgeRead, type ObservedCell } from './types';

export { MAX_EXPLORATION_READS, MAX_EXPLORATION_READ_BYTES } from './explorationPolicy.read';
interface Evidence { baseline: KnowledgeAnchor; index: number; at: WorldPosition; previousSource: CellSource | null }
export type ExplorationMaterialChange = Evidence & (
  | { reason: 'space-entered' | 'other-space-visible' }
  | { reason: 'unopened-chest'; chestId: string }
  | { reason: 'stairs-discovered'; stair: ObservedCell['stairs'][number] }
  | { reason: 'chest-changed'; chestId: string; before: boolean; after: boolean | null }
  | { reason: 'traversability-changed'; direction: Direction; before: WorldPosition | null;
      after: WorldPosition | null }
);

/** Run before observation/memory writes with engine-supplied cells (actor first). This result
 * is provisional: attach index to the successfully committed next observation, never invent
 * a source here. One reason, not a route, completion proof, or permission to interact.
 */
export async function compareExplorationObservation(pages: KnowledgeRead, beforeInput: GameCheckpoint,
  newCells: readonly ObservedCell[], scopeSpaceId: string): Promise<ExplorationMaterialChange | null> {
  const checkpoint = gameCheckpoint(beforeInput); id(scopeSpaceId);
  check(checkpoint.position.cell.spaceId === scopeSpaceId, 'exploration requires the occupied selected space');
  const cells = explorationCells(newCells, checkpoint.position.level), before = await explorationView(pages, checkpoint);
  const remembered = await before.known(cells);
  const evidence = (index: number): Evidence => ({ baseline: structuredClone(before.anchor),
    at: structuredClone(cells[index].at), index, previousSource: remembered[index].state === 'unknown'
      ? null : structuredClone(remembered[index].cell.source) });
  if (cells[0].at.cell.spaceId !== scopeSpaceId) return { ...evidence(0), reason: 'space-entered' };
  const ordered = cells.map((cell, index) => ({ cell, index })).sort((a, b) =>
    a.cell.world.row - b.cell.world.row || a.cell.world.column - b.cell.world.column);
  let discovery: ExplorationMaterialChange | null = null;
  for (const { cell, index } of ordered) {
    const entry = remembered[index], prior = entry.state === 'unknown' ? undefined : entry.cell;
    for (const direction of DIRECTIONS) {
      const edge = prior?.edges[direction];
      if (edge && Object.hasOwn(cell.edges, direction) && !same(edge.target, cell.edges[direction])) return {
        ...evidence(index), reason: 'traversability-changed', direction, before: structuredClone(edge.target),
        after: structuredClone(cell.edges[direction]!), previousSource: structuredClone(edge.source),
      };
    }
    for (const chest of prior?.chests ?? []) {
      const current = cell.chests.find(c => c.id === chest.id);
      if (!current || current.opened !== chest.opened) return { ...evidence(index), reason: 'chest-changed',
        chestId: chest.id, before: chest.opened, after: current?.opened ?? null };
    }
    for (const chest of cell.chests) if (!chest.opened && !prior?.chests.some(c => c.id === chest.id))
      discovery ??= { ...evidence(index), reason: 'unopened-chest', chestId: chest.id };
    for (const stair of ['town', 'up', 'down'] as const) if (cell.stairs.includes(stair) && !prior?.stairs.includes(stair))
      discovery ??= { ...evidence(index), reason: 'stairs-discovered', stair };
  }
  if (discovery) return discovery;
  const visibleSpaces = new Set(before.current.cells.map(c => c.at.cell.spaceId));
  const other = ordered.find(({ cell }) => cell.at.cell.spaceId !== scopeSpaceId && !visibleSpaces.has(cell.at.cell.spaceId));
  return other ? { ...evidence(other.index), reason: 'other-space-visible' } : null;
}
