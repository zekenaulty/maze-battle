import type { RpgAddress, RpgKnownRoute, RpgRefusal, RpgUnknown } from '../../domain/agentic/knowledge/types';
import { directions, validAddress } from '../../domain/agentic/knowledge/shared';
import { movePosition, opposite } from '../../domain/maze/movement';
import type { NavigationPlan } from '../../domain/directed/navigation';
import { cellMemoryKey } from '../rpgMemory/keys';
import type { MemoryQuery } from '../rpgMemory/query';
import { sameTravelPosition } from './validation';

export const travelAddress = (address: RpgAddress) => ({ spaceId: `rpg:${address.floor}`, row: address.row, column: address.column });
export const rememberedCell = (memory: MemoryQuery, address: RpgAddress) =>
  memory.tree.get(cellMemoryKey(address)).then(value => memory.cell(value, address));

export async function rememberedStep(memory: MemoryQuery, from: RpgAddress, to: RpgAddress) {
  if (!validAddress(to) || from.floor !== to.floor) return;
  const direction = directions.find(d => sameTravelPosition({ floor: from.floor, ...movePosition(from, d) }, to));
  if (!direction) return;
  const left = await rememberedCell(memory, from), right = await rememberedCell(memory, to);
  return left?.edges[direction]?.state === 'open' && right?.edges[opposite(direction)]?.state === 'open' ? direction : undefined;
}

export function destinationPlan(route: RpgKnownRoute | RpgRefusal | RpgUnknown): NavigationPlan {
  if (route.status === 'ready') return { status: 'ready', route: route.path.map(travelAddress), distance: route.distance, visits: route.visits };
  return { status: 'unavailable', reason: route.status === 'refused' ? 'Known-map budget exceeded.'
    : route.reason === 'no_known_route' ? 'No known route.' : 'Destination is not known.' };
}
