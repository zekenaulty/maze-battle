import { equal } from '../../../persistence/canonical/agentica/validation';
import { check, jsonBytes } from '../../../persistence/canonical/validation';
import type { KnowledgeAnchor, ObservedCell } from '../../../persistence/canonical/knowledge/types';
import { observation, type PerceptionContext } from './context';
import { flatAddress, inspectionCursor } from './validation';
import { MAX_OBSERVATION_BYTES, MAX_PERCEPTION_READ_BYTES, OBJECT_PAGE_ITEMS, type InspectQuery } from './types';

function stairwaysAt(cell: ObservedCell, index: number, anchor: KnowledgeAnchor) {
  return cell.stairs.map(direction => {
    const destination = direction === 'town' || direction === 'up' && cell.at.level === 1 ? 'town'
      : cell.at.level + (direction === 'down' ? 1 : -1);
    return { direction, at: flatAddress(cell.at), targetLevel: typeof destination === 'number' && !Number.isSafeInteger(destination) ? null : destination,
      // Canonical generation places floor entry/exit stairs in landing rooms. This is a presentation hint, not a world lookup or travel grant.
      destinationKind: destination === 'town' ? 'town' : 'landing-room', source: { sequence: anchor.sequence, id: anchor.id, index } };
  });
}
/** All hints are sourced from the current committed publication, never remembered or hidden stairs. */
export function visibleStairways(c: PerceptionContext) {
  const sight = c.sight, anchor = c.checkpoint.knowledge;
  if (!sight || !anchor || c.checkpoint.mode === 'town' || !equal(sight.header.actor, c.checkpoint.position)) return [];
  return sight.cells.flatMap((cell, index) => stairwaysAt(cell, index, anchor));
}

/** Current committed sight only. No memory/world scan, refresh, contents, or interaction grant. */
export function objectObservation(c: PerceptionContext, query: InspectQuery, start: number) {
  const sight = c.sight, anchor = c.checkpoint.knowledge;
  if (!sight || !anchor || c.checkpoint.mode === 'town' || !equal(sight.header.actor, c.checkpoint.position)) {
    check(start === 0, 'objects cursor has no current sight');
    return observation(c, { scope: 'objects', state: 'unavailable', objects: [] });
  }
  check(start === 0 || start < sight.cells.length, 'objects cursor is outside current sight');
  const candidates = sight.cells.flatMap((cell, index) => cell.chests.length || cell.stairs.length ? [{
    index, value: { at: flatAddress(cell.at), chests: cell.chests, stairs: cell.stairs,
      ...(cell.stairs.length ? { stairways: stairwaysAt(cell, index, anchor) } : {}),
      source: { sequence: anchor.sequence, id: anchor.id, index } },
  }] : []).filter(cell => cell.index >= start);
  const objects: typeof candidates[number]['value'][] = [];
  const data = (items: typeof objects, after?: number) => ({ scope: 'objects', state: 'visible', objects: items,
    ...(after === undefined ? {} : { next: inspectionCursor(c.ref, query, after) }) });
  let next: number | undefined;
  for (let i = 0; i < Math.min(candidates.length, OBJECT_PAGE_ITEMS); i++) {
    const candidate = candidates[i], after = candidates[i + 1]?.index;
    const value = data([...objects, candidate.value], after);
    const bytes = jsonBytes(observation(c, value, MAX_PERCEPTION_READ_BYTES), MAX_PERCEPTION_READ_BYTES);
    if (bytes > MAX_OBSERVATION_BYTES) {
      check(objects.length > 0, 'single visible object exceeds observation budget'); break;
    }
    objects.push(structuredClone(candidate.value)); next = after;
  }
  return observation(c, data(objects, next));
}
