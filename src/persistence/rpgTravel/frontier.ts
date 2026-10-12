import { movePosition } from '../../domain/maze/movement';
import { validAddress } from '../../domain/agentic/knowledge/shared';
import type { MemoryQuery } from '../rpgMemory/query';
import { rememberedCell } from './navigation';
import { sameTravelPosition } from './validation';
import type { RpgFrontierTarget } from './types';

/** Validate only the selected boundary against its current earned source, never world geometry. */
export async function frontierAvailable(memory: MemoryQuery, frontier: RpgFrontierTarget) {
  const receipt = memory.head.observation;
  if (receipt.id !== frontier.sourceId || frontier.anchor.floor !== receipt.actor.floor
    || sameTravelPosition(frontier.anchor, receipt.actor)) return false;
  const cell = receipt.cells.find(value => sameTravelPosition(value.address, frontier.anchor));
  if (!cell || cell.links.includes(frontier.direction) || cell.blocked.includes(frontier.direction)) return false;
  const beyond = { floor: frontier.anchor.floor, ...movePosition(frontier.anchor, frontier.direction) };
  return validAddress(beyond) && !await rememberedCell(memory, beyond);
}
