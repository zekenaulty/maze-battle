import { corridorExit, EXPLORATION_TRAIL_LIMIT, explorationNoticeText, noticeForCell, type ExplorationNotice } from '../../domain/agentic/explorationPolicy';
import type { RpgAddress, RpgObservation } from '../../domain/agentic/knowledge/types';
import { stopDestinationOperation, type DestinationOperation } from '../../domain/directed/destinationExecution';
import { DEFAULT_DESTINATION_LIMITS, limitReached } from '../../domain/directed/destinationLimits';
import type { MemoryQuery } from '../rpgMemory/query';
import { rememberedCell, travelAddress } from './navigation';
import { sameTravelPosition } from './validation';
import type { RpgExploration, RpgTravelRecord } from './types';

/** Only committed perception and prior earned memory may change this bounded local intention. */
export async function continueExploration(record: RpgTravelRecord, previous: MemoryQuery, current: RpgObservation,
  operation: DestinationOperation<RpgAddress>) {
  const position = current.actor, state: RpgExploration = structuredClone(record.exploration!);
  if (!state.trail.some(p => sameTravelPosition(p, position))) state.trail.push(position);
  const yieldFor = (decision: ExplorationNotice) => ({ exploration: { ...state, decision },
    operation: stopDestinationOperation(operation, 'interrupted', explorationNoticeText(decision)) });
  const cells = [...current.cells].sort((a, b) =>
    Math.abs(a.address.row - position.row) + Math.abs(a.address.column - position.column)
    - Math.abs(b.address.row - position.row) - Math.abs(b.address.column - position.column)
    || a.address.row - b.address.row || a.address.column - b.address.column);
  for (const cell of cells) {
    const notice = noticeForCell(cell, await rememberedCell(previous, cell.address), current.id);
    if (notice) return yieldFor(notice);
  }
  if (state.trail.length >= EXPLORATION_TRAIL_LIMIT)
    return yieldFor({ kind: 'capacity', at: position, sourceId: current.id });
  if (operation.status !== 'arrived') return { exploration: state, operation };
  if (limitReached(operation.steps, (operation.limits ?? DEFAULT_DESTINATION_LIMITS).steps))
    return { exploration: state, operation: stopDestinationOperation(operation, 'interrupted', 'Travel step budget exhausted.') };
  const selected = state.phase === 'approach' ? record.frontier!.direction : undefined;
  const exit = corridorExit(current, record.position, state.trail, selected);
  if (exit.kind === 'decision') return yieldFor(exit.notice);
  state.phase = 'corridor';
  // Extend a local waypoint, never the original selection, deadline, sequence, or usage grant.
  return { exploration: state, operation: { ...operation, status: 'running' as const, target: exit.target,
    route: [travelAddress(exit.target)], reason: 'Continuing the explicitly authorized observed corridor.' } };
}
