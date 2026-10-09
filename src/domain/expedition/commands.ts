import { movePosition, opposite } from '../maze/movement';
import { addressKey, sameAddress } from './address';
import { observeExpedition, rememberObservation } from './observation';
import type { ExpeditionCheckpoint, ExpeditionCommand, ExpeditionPlan, SpaceGeometry, SpaceSpec } from './types';

export type GeometryReader = (spec: SpaceSpec) => SpaceGeometry;
export interface ExpeditionTransition { checkpoint: ExpeditionCheckpoint; applied: boolean; reason: string }

export function createExpeditionCheckpoint(plan: ExpeditionPlan, read: GeometryReader): ExpeditionCheckpoint {
  const checkpoint: ExpeditionCheckpoint = {
    version: 1, worldId: plan.recipe.worldId, floorId: plan.recipe.floorId, scopeId: plan.scopeId,
    revision: 0, position: { ...plan.start }, home: { ...plan.start }, openedChestIds: [],
    knowledge: { cells: {}, openings: {}, chests: {} }, phase: 'exploring', moves: 0,
  };
  return reveal(plan, checkpoint, read);
}

export function applyExpeditionCommand(plan: ExpeditionPlan, current: ExpeditionCheckpoint, command: ExpeditionCommand, read: GeometryReader): ExpeditionTransition {
  const refuse = (reason: string) => ({ checkpoint: current, applied: false, reason });
  if (current.worldId !== plan.recipe.worldId || current.floorId !== plan.recipe.floorId || current.scopeId !== plan.scopeId) return refuse('World identity mismatch.');
  if (current.phase === 'complete') return refuse('Expedition is complete.');
  const spec = plan.spaces.find(space => space.id === current.position.spaceId);
  if (!spec) return refuse('Current space is unavailable.');
  let next = { ...current, revision: current.revision + 1 };
  if (command.type === 'move') {
    const cell = read(spec).cells.find(cell => cell.row === current.position.row && cell.column === current.position.column);
    const opening = spec.openings.find(port => port.cell.row === current.position.row && port.cell.column === current.position.column && port.direction === command.direction);
    if (opening) {
      const target = plan.spaces.find(space => space.id === opening.destination.spaceId);
      const reciprocal = target?.openings.find(port => sameAddress(port.destination, current.position)
        && port.direction === opposite(command.direction) && port.cell.row === opening.destination.row && port.cell.column === opening.destination.column);
      if (!target || !reciprocal || !read(target).cells.some(cell => cell.row === opening.destination.row && cell.column === opening.destination.column)) return refuse('Opening is unavailable.');
      next.position = { ...opening.destination };
      next.knowledge = { ...current.knowledge, openings: { ...current.knowledge.openings,
        [opening.id]: { id: opening.id, ...current.position, direction: opening.direction, destination: { ...next.position }, observedAt: next.revision },
        [reciprocal.id]: { id: reciprocal.id, ...next.position, direction: reciprocal.direction, destination: { ...current.position }, observedAt: next.revision },
      } };
    } else {
      if (!cell?.links.includes(command.direction)) return refuse('Wall blocks movement.');
      const position = movePosition(current.position, command.direction);
      if (!read(spec).cells.some(cell => cell.row === position.row && cell.column === position.column)) return refuse('Destination is unavailable.');
      next.position = { ...position, spaceId: spec.id };
    }
    next.moves++;
  } else if (command.type === 'collect') {
    const chest = spec.chests.find(chest => chest.cell.row === current.position.row && chest.cell.column === current.position.column && !current.openedChestIds.includes(chest.id));
    if (!chest) return refuse('No unopened chest here.');
    next.openedChestIds = [...current.openedChestIds, chest.id];
  } else if (command.type === 'finish') {
    if (!sameAddress(current.position, current.home)) return refuse('Return to the entry to finish.');
    if (!scopeExplored(plan, current, read)) return refuse('Unexplored passages or uncollected chests remain.');
    next.phase = 'complete';
  } else return refuse('Unknown command.');
  next = reveal(plan, next, read);
  return { checkpoint: next, applied: true, reason: command.type === 'collect' ? 'Chest collected.' : next.phase === 'complete' ? 'Expedition complete.' : 'Moved.' };
}

function reveal(plan: ExpeditionPlan, checkpoint: ExpeditionCheckpoint, read: GeometryReader) {
  const spec = plan.spaces.find(space => space.id === checkpoint.position.spaceId);
  if (!spec) throw new Error('Current space is unavailable.');
  return rememberObservation(checkpoint, observeExpedition(checkpoint, spec, read(spec)));
}

function scopeExplored(plan: ExpeditionPlan, checkpoint: ExpeditionCheckpoint, read: GeometryReader) {
  return plan.spaces.every(space => space.chests.every(chest => checkpoint.openedChestIds.includes(chest.id))
    && space.openings.every(port => checkpoint.knowledge.openings[port.id]?.destination)
    && read(space).cells.filter(cell => cell.links.length > 0).every(cell => checkpoint.knowledge.cells[addressKey({ ...cell, spaceId: space.id })]));
}
