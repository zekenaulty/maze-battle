import { alignedLowerFrame, STAIR_LAYOUT_VERSION, validFloorFrame } from '../../../domain/expedition/vertical';
import { world } from '../../../domain/expedition/topology/geometry';
import { check } from '../validation';
import { levelKey, loadFloor, loadSpace, required, same } from './records';
import type { WorldRead, WorldStairs } from './types';

/** Bounded reciprocal placement validation, shared by travel and transient sight publication. */
export async function loadPlacedStairs(pages: WorldRead, upperLevel: number, input?: WorldStairs) {
  const stairs = input ?? await required<WorldStairs>(pages, `${levelKey(upperLevel)}/stairs`);
  const upper = await loadFloor(pages, upperLevel), lower = await loadFloor(pages, upperLevel + 1);
  const p = stairs.placement;
  check(stairs.schema === 1 && stairs.upper.level === upperLevel && stairs.lower.level === upperLevel + 1
    && same(stairs.upper.cell, upper.exit) && same(stairs.lower.cell, lower.entry)
    && upper.generation.recipe.worldId === lower.generation.recipe.worldId, 'invalid reciprocal placed stairs');
  check(p?.version === 'straight-stair-placement-v1' && p.recipe === 'straight-stair-v1'
    && upper.spatial?.version === STAIR_LAYOUT_VERSION && lower.spatial?.version === STAIR_LAYOUT_VERSION
    && validFloorFrame(p.upperFrame) && validFloorFrame(p.lowerFrame)
    && same(p.upperFrame, upper.spatial.frame) && same(p.lowerFrame, lower.spatial.frame), 'invalid pinned stair placement');
  const a = await loadSpace(pages, upperLevel, stairs.upper.cell.spaceId), b = await loadSpace(pages, upperLevel + 1, stairs.lower.cell.spaceId);
  check(a.value.stairwell?.end === 'upper' && b.value.stairwell?.end === 'lower', 'missing reserved stair rooms');
  const upperPoint = world(a.value.spec, stairs.upper.cell), lowerPoint = world(b.value.spec, stairs.lower.cell);
  check(same(alignedLowerFrame(p.upperFrame, upperPoint, lowerPoint), p.lowerFrame), 'misaligned stair landing frames');
  return { stairs: { ...stairs, placement: p }, upperPoint, lowerPoint };
}
