import type { Direction } from '../types';
import { movePosition, opposite } from '../maze/movement';
import { directions } from './knowledge/shared';
import type { RpgAddress, RpgObservation, RpgObservedCell, RpgRememberedCell } from './knowledge/types';

export const EXPLORATION_TRAIL_LIMIT = 256;
export type ExplorationNoticeKind = 'junction' | 'object' | 'changed' | 'visibility' | 'loop' | 'capacity' | 'boundary';
export interface ExplorationNotice {
  readonly kind: ExplorationNoticeKind;
  readonly at: RpgAddress;
  readonly sourceId: string;
}

const sameAddress = (a: RpgAddress, b: RpgAddress) =>
  a.floor === b.floor && a.row === b.row && a.column === b.column;
const notice = (kind: ExplorationNoticeKind, at: RpgAddress, sourceId: string): ExplorationNotice =>
  ({ kind, at: { ...at }, sourceId });

export function noticeForCell(current: RpgObservedCell, previous: RpgRememberedCell | undefined,
  sourceId: string): ExplorationNotice | undefined {
  const retained = previous && sameAddress(current.address, previous.address) ? previous : undefined;
  if (current.chests.some(chest => {
    const known = retained?.chests.find(candidate => candidate.id === chest.id);
    return !known || known.opened !== chest.opened || !sameAddress(known.position, chest.position);
  }) || current.stairs.some(stair => !retained?.stairs.includes(stair))
    || retained?.chests.some(chest => !current.chests.some(candidate => candidate.id === chest.id))
    || retained?.stairs.some(stair => !current.stairs.includes(stair))) {
    return notice('object', current.address, sourceId);
  }
  if (current.links.some(direction => retained?.edges[direction]?.state === 'blocked')
    || current.blocked.some(direction => retained?.edges[direction]?.state === 'open')) {
    return notice('changed', current.address, sourceId);
  }
  // Walls are complete even when open endpoints are cropped from links.
  const junction = directions.filter(direction => !current.blocked.includes(direction)).length >= 3;
  const knownJunction = retained && directions.filter(direction => {
    const edge = retained.edges[direction];
    // A cropped exit can retain an older collision fact; only latest-receipt walls describe this sighting.
    return edge?.state !== 'blocked' || edge.source.id !== retained.source.id;
  }).length >= 3;
  if (junction && !knownJunction) return notice('junction', current.address, sourceId);
  return undefined;
}

export function corridorExit(observation: RpgObservation, previous: RpgAddress,
  visited: readonly RpgAddress[], selectedDirection?: Direction):
  { kind: 'advance'; target: RpgAddress } | { kind: 'decision'; notice: ExplorationNotice } {
  const decision = (kind: ExplorationNoticeKind, at = observation.actor) =>
    ({ kind: 'decision' as const, notice: notice(kind, at, observation.id) });
  if (visited.length >= EXPLORATION_TRAIL_LIMIT) return decision('capacity');
  const current = observation.cells.find(cell => sameAddress(cell.address, observation.actor));
  if (!current) return decision('visibility');
  const candidates = (selectedDirection === undefined ? directions : [selectedDirection])
    .filter(direction => !current.blocked.includes(direction))
    .map(direction => ({ direction, target: { floor: current.address.floor, ...movePosition(current.address, direction) } }))
    .filter(({ target }) => selectedDirection !== undefined || !sameAddress(target, previous));
  if (candidates.length === 0) return decision('boundary');
  if (candidates.length > 1) return decision('junction');
  const { direction, target } = candidates[0];
  const endpoint = observation.cells.find(cell => sameAddress(cell.address, target));
  if (!endpoint || !current.links.includes(direction) || !endpoint.links.includes(opposite(direction))) {
    return decision('visibility', target);
  }
  if (endpoint.blocked.includes(opposite(direction))) return decision('boundary', target);
  if (visited.some(address => sameAddress(address, target))) return decision('loop', target);
  return { kind: 'advance', target };
}

export function explorationNoticeText(value: ExplorationNotice): string {
  switch (value.kind) {
    case 'junction': return 'A junction needs a direction choice.';
    case 'object': return 'Observed objects changed.';
    case 'changed': return 'An observed passage differs from memory.';
    case 'visibility': return 'Current sight does not confirm the next step.';
    case 'loop': return 'The next step revisits this exploration trail.';
    case 'capacity': return 'Exploration trail limit reached; checkpoint needed.';
    case 'boundary': return 'No unblocked continuation on this path.';
  }
}
