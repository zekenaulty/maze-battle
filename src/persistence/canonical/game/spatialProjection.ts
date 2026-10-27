import { movePosition, opposite } from '../../../domain/maze/movement';
import { world } from '../../../domain/expedition/topology/geometry';
import { stairReservedCells } from '../../../domain/expedition/vertical';
import { spatialBinding, MAX_STAIR_ROOMS, MAX_STAIR_ROOM_CELLS, type SpatialView, type SpatialRoom } from '../../../services/game/SpatialView';
import { DIRECTIONS, type ObservedCell } from '../knowledge/types';
import type { CanonicalSnapshot } from '../types';
import type { WorldRead, WorldStairs } from '../world/types';
import { loadPlacedStairs } from '../world/placedStairs';
import { loadWorldRoom } from '../world/residency';
import { levelKey, loadFloor, loadWorld, same } from '../world/records';
import { check, jsonBytes } from '../validation';
import type { GameCheckpoint } from './checkpoint';
import { readPreparation } from './preparation';

/** Current stair rooms plus directly connected rooms. Never recurse through preview-room stairs. */
export async function projectSpatialView(pages: WorldRead, snapshot: CanonicalSnapshot, c: GameCheckpoint, observed: ObservedCell[] = []): Promise<SpatialView | undefined> {
  const floor = await loadFloor(pages, c.position.level);
  if (!floor.spatial || !c.knowledge || c.mode === 'town') return;
  const header = await loadWorld(pages);
  check(floor.generation.recipe.worldId === header.worldId, 'foreign connector floor');
  const result: SpatialView = { version: 'stair-room-sight-v2', binding: spatialBinding(snapshot), frame: floor.spatial.frame,
    prepareDown: false, connectors: [], rooms: [], ports: [] };
  const room = async (level: number, spaceId: string, frame: SpatialRoom['frame']) => {
    const id = level + '/' + spaceId, prior = result.rooms!.find(r => r.id === id); if (prior) return prior;
    check(result.rooms!.length < MAX_STAIR_ROOMS, 'stair room disclosure budget exceeded');
    const resident = await loadWorldRoom(pages, level, spaceId), { geometry, space } = resident;
    check(geometry.cells.length <= 225, 'oversized connected stair room');
    const cells: ObservedCell[] = geometry.cells.map(cell => {
      const at = { level, cell: { spaceId, row: cell.row, column: cell.column } }, edges: ObservedCell['edges'] = {};
      for (const d of DIRECTIONS) edges[d] = cell.links.includes(d) ? { level, cell: { spaceId, ...movePosition(cell, d) } } : null;
      for (const link of resident.connections) {
        const forward = link.from.spaceId === spaceId;
        if (same(forward ? link.from : link.to, at.cell)) edges[forward ? link.direction : opposite(link.direction)] = { level, cell: forward ? link.to : link.from };
      }
      return { at, world: world(space.spec, cell), edges, chests: [], stairs: [] };
    });
    const value: SpatialRoom = { id, level, spaceId, frame, kind: space.spec.kind, cells,
      ...(space.spec.furnishing !== undefined ? { furnishing: space.spec.furnishing } : {}),
      voids: space.stairwell ? stairReservedCells(space.spec, space.stairwell).map(cell => ({ world: world(space.spec, cell),
        floorOpen: space.stairwell!.end === 'upper', ceilingOpen: space.stairwell!.end === 'lower' })) : [] };
    result.rooms!.push(value); return value;
  };
  const candidates = [floor.exit && { cell: floor.exit, end: 'upper' as const }, floor.level > 1 && { cell: floor.entry, end: 'lower' as const }]
    .filter((candidate): candidate is { cell: NonNullable<typeof floor.exit>; end: 'upper' | 'lower' } => !!candidate)
    .filter(candidate => candidate.cell.spaceId === c.position.cell.spaceId || observed.some(cell => cell.at.level === floor.level && cell.at.cell.spaceId === candidate.cell.spaceId));
  for (const candidate of candidates) {
    const source = await room(floor.level, candidate.cell.spaceId, floor.spatial.frame), down = candidate.end === 'upper';
    const upperLevel = down ? floor.level : floor.level - 1, id = header.worldId + '/stairs/' + upperLevel;
    const at = { level: floor.level, cell: candidate.cell }, sourceCell = source.cells.find(cell => same(cell.at, at));
    check(sourceCell, 'stair port outside structural room');
    result.ports!.push({ id, at, world: sourceCell.world, frame: floor.spatial.frame, end: candidate.end });
    const record = await pages.get('world', levelKey(upperLevel) + '/stairs');
    if (!record) {
      check(down && header.deepestLevel === floor.level, 'missing established stair connection');
      result.prepareDown = true; continue;
    }
    const placed = await loadPlacedStairs(pages, upperLevel, record.value as unknown as WorldStairs);
    const target = down ? placed.stairs.lower : placed.stairs.upper, targetFrame = down ? placed.stairs.placement.lowerFrame : placed.stairs.placement.upperFrame;
    await room(target.level, target.cell.spaceId, targetFrame);
    const ready = await readPreparation(pages, target.level) === 'ready';
    result.prepareDown ||= down && !ready;
    result.connectors!.push({ id, ...placed.stairs, upperPoint: placed.upperPoint, lowerPoint: placed.lowerPoint,
      targetFrame, geometryReady: true, travelReady: ready, cells: [] });
  }
  check(result.rooms!.reduce((n, r) => n + r.cells.length, 0) <= MAX_STAIR_ROOM_CELLS, 'stair room cell budget exceeded');
  const selected = result.connectors!.find(link => same(link.upper, c.position) || same(link.lower, c.position)) ?? result.connectors![0];
  if (selected) result.connector = selected;
  jsonBytes(result, 1024 * 1024);
  return result;
}
