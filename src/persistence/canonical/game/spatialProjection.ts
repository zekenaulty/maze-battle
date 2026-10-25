import { linkedVision } from '../../../domain/maze/linkedVision';
import { movePosition } from '../../../domain/maze/movement';
import { world } from '../../../domain/expedition/topology/geometry';
import { spatialBinding, type SpatialView } from '../../../services/game/SpatialView';
import { DIRECTIONS, type ObservedCell } from '../knowledge/types';
import type { CanonicalSnapshot } from '../types';
import type { WorldRead, WorldStairs } from '../world/types';
import { loadPlacedStairs } from '../world/placedStairs';
import { levelKey, loadFloor, loadSpace, loadWorld, same } from '../world/records';
import { check } from '../validation';
import type { GameCheckpoint } from './checkpoint';
import { readPreparation } from './preparation';

/** At most one established adjacent landing. No content, graph, seed or foreign room reads. */
export async function projectSpatialView(pages: WorldRead, snapshot: CanonicalSnapshot, c: GameCheckpoint, observed: ObservedCell[] = []): Promise<SpatialView | undefined> {
  const floor = await loadFloor(pages, c.position.level);
  if (!floor.spatial || !c.knowledge || c.mode === 'town') return;
  check(floor.generation.recipe.worldId === (await loadWorld(pages)).worldId, 'foreign connector floor');
  const result: SpatialView = { version: 'connector-sight-v1', binding: spatialBinding(snapshot), frame: floor.spatial.frame, prepareDown: false };
  const down = same(c.position.cell, floor.exit), up = c.position.level > 1 && same(c.position.cell, floor.entry);
  const seenDown = down || observed.some(cell => cell.at.level === floor.level && same(cell.at.cell, floor.exit));
  const seenUp = up || floor.level > 1 && observed.some(cell => cell.at.level === floor.level && same(cell.at.cell, floor.entry));
  if (!seenDown && !seenUp) return result;
  const chooseDown = down || !up && seenDown;
  const upperLevel = chooseDown ? floor.level : floor.level - 1;
  const record = await pages.get('world', `${levelKey(upperLevel)}/stairs`);
  if (!record) {
    check(chooseDown && (await loadWorld(pages)).deepestLevel === floor.level, 'missing established stair connection');
    result.prepareDown = down; return result;
  }
  const placed = await loadPlacedStairs(pages, upperLevel, record.value as unknown as WorldStairs), target = chooseDown ? placed.stairs.lower : placed.stairs.upper;
  const ready = await readPreparation(pages, target.level) === 'ready';
  result.prepareDown = down && !ready;
  result.connector = { id: `${floor.generation.recipe.worldId}/stairs/${upperLevel}`, ...placed.stairs,
    upperPoint: placed.upperPoint, lowerPoint: placed.lowerPoint,
    targetFrame: chooseDown ? placed.stairs.placement.lowerFrame : placed.stairs.placement.upperFrame, cells: [] };
  if (!ready || !down && !up) return result;
  const { geometry, value } = await loadSpace(pages, target.level, target.cell.spaceId);
  const key = (p: { row: number; column: number }) => `${p.row}:${p.column}`;
  const byCell = new Map(geometry.cells.map(cell => [key(cell), cell])), start = byCell.get(key(target.cell));
  check(start, 'landing sight outside walkable geometry');
  const visible = linkedVision(start, 1, key, cell => cell.links.map(d => byCell.get(key(movePosition(cell, d)))!), 5);
  const admitted = new Set(visible.map(key));
  const cells: ObservedCell[] = visible.map(cell => {
    const edges: ObservedCell['edges'] = {};
    for (const d of DIRECTIONS) {
      const next = movePosition(cell, d);
      if (!cell.links.includes(d)) edges[d] = null;
      else if (admitted.has(key(next))) edges[d] = { level: target.level, cell: { spaceId: target.cell.spaceId, ...next } };
    }
    return { at: { level: target.level, cell: { spaceId: target.cell.spaceId, row: cell.row, column: cell.column } },
      world: world(value.spec, cell), edges, chests: [], stairs: [] };
  });
  result.connector.cells = cells;
  return result;
}
