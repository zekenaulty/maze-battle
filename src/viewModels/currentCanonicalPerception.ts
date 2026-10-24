import type { GameView } from '../services/game/GameView';
import type { KnowledgeRegion, KnowledgeRegionScope, PerceivedCell } from '../persistence/canonical/knowledge/region';
import type { RememberedCell } from '../persistence/canonical/knowledge/types';
import { currentVisibleCell } from './canonicalPerceivedMaze';

export type PerceptionGame = Pick<GameView, 'id' | 'snapshot' | 'checkpoint' | 'observation'>;
export interface PerceptionFrame { game: PerceptionGame; region: KnowledgeRegion }
const sameRef = (a: { id: string; sequence: number } | null | undefined, b: { id: string; sequence: number } | null | undefined) => !!a && !!b && a.id === b.id && a.sequence === b.sequence;

/** Presentation only: published sight is immediate; prior facts require an explicit observation-chain link. */
export function currentCanonicalPerception(game: PerceptionGame, scope: KnowledgeRegionScope, previous?: PerceptionFrame): KnowledgeRegion | undefined {
  const actor = currentVisibleCell(game), observation = game.observation, anchor = game.checkpoint.knowledge;
  if (!actor || !observation || !anchor || actor.at.level !== scope.floor) return;
  const contains = (cell: { world: { row: number; column: number } }) => cell.world.row >= scope.row && cell.world.row < scope.row + scope.rows
    && cell.world.column >= scope.column && cell.world.column < scope.column + scope.columns;
  const cells = new Map<string, PerceivedCell>();
  const old = previous?.game, oldAnchor = old?.checkpoint.knowledge;
  const connected = old && old.id === game.id && old.snapshot.generation === game.snapshot.generation
    && previous.region.scope.floor === scope.floor && (sameRef(observation.header.previous, oldAnchor)
      || sameRef(anchor, oldAnchor) && anchor.witness === oldAnchor?.witness && game.snapshot.roots.knowledge === old.snapshot.roots.knowledge);
  if (connected) for (const entry of previous.region.cells) {
    if (contains(entry.cell)) cells.set(`${entry.cell.world.row}:${entry.cell.world.column}`, { state: 'remembered', cell: entry.cell });
  }
  observation.cells.forEach((cell, index) => {
    if (cell.at.level !== scope.floor || !contains(cell)) return;
    const source = { sequence: anchor.sequence, id: anchor.id, index };
    const remembered: RememberedCell = { ...cell, source, edges: Object.fromEntries(Object.entries(cell.edges).map(([direction, target]) => [direction, { target, source }])) };
    cells.set(`${cell.world.row}:${cell.world.column}`, { state: 'visible', cell: remembered, observation: cell });
  });
  return { scope, actor: actor.world, cells: [...cells.values()].sort((a, b) => a.cell.world.row - b.cell.world.row || a.cell.world.column - b.cell.world.column) };
}
