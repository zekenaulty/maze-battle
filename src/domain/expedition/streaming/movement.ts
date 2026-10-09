import { movePosition, opposite } from '../../maze/movement';
import type { Direction } from '../../types';
import { sameAddress } from '../address';
import { resolvedSpaceSpec } from '../topology/projection';
import { emptyKnowledge } from './observation';
import type { StreamCheckpoint, StreamCommandContext, StreamKnowledgePage, StreamRoom } from './types';

export interface StreamMove { room: StreamRoom; page: StreamKnowledgePage; source?: StreamKnowledgePage; reason?: string }

/** Mutates only the tentative checkpoint and owned page; persistence publishes later. */
export async function moveStream(context: StreamCommandContext, checkpoint: StreamCheckpoint,
  page: StreamKnowledgePage, direction: Direction): Promise<StreamMove> {
  const room = context.current;
  const spec = resolvedSpaceSpec(room.space, room.connections);
  const port = spec.openings.find(value => value.direction === direction && value.cell.row === checkpoint.position.row && value.cell.column === checkpoint.position.column);
  if (!port) {
    const cell = context.geometry(room.space).cells.find(value => value.row === checkpoint.position.row && value.column === checkpoint.position.column);
    if (!cell?.links.includes(direction)) return { room, page, reason: 'Wall or unprepared doorway blocks movement.' };
    checkpoint.position = { ...movePosition(checkpoint.position, direction), spaceId: spec.id };
    return { room, page };
  }
  const target = await context.loadRoom(port.destination.spaceId);
  if (page.openings[port.id]?.destination && !target.knowledge) throw new Error('Previously visited room has lost its knowledge page');
  const targetSpec = resolvedSpaceSpec(target.space, target.connections);
  const reciprocal = targetSpec.openings.find(value => sameAddress(value.destination, checkpoint.position)
    && value.direction === opposite(direction) && value.cell.row === port.destination.row && value.cell.column === port.destination.column);
  if (!reciprocal || !context.geometry(target.space).cells.some(cell => cell.row === port.destination.row && cell.column === port.destination.column)) {
    throw new Error('Committed doorway lacks its reciprocal walkable endpoint');
  }
  const destination = structuredClone(target.knowledge ?? emptyKnowledge(targetSpec.id, checkpoint.revision));
  if (!target.knowledge) {
    destination.parentOpeningId = reciprocal.id;
    checkpoint.visitedSpaces++;
  }
  if (page.cleared && page.parentOpeningId === port.id && !destination.completedExits.includes(reciprocal.id)) {
    destination.completedExits.push(reciprocal.id);
  }
  page.openings[port.id] = { ...checkpoint.position, id: port.id, direction, destination: { ...port.destination }, observedAt: checkpoint.revision };
  destination.openings[reciprocal.id] = { ...port.destination, id: reciprocal.id, direction: reciprocal.direction,
    destination: { ...checkpoint.position }, observedAt: checkpoint.revision };
  page.revision = checkpoint.revision;
  checkpoint.position = { ...port.destination };
  return { room: target, page: destination, source: page };
}
