import type { Direction } from '../../domain/types';
import { movePosition } from '../../domain/maze/movement';
import { directions, freeze, integer, sourceOf, validAddress, validId } from '../../domain/agentic/knowledge/shared';
import { RPG_KNOWLEDGE_LIMITS as LIMITS, type RpgAddress, type RpgSource } from '../../domain/agentic/knowledge/types';
import { cellMemoryKey } from './keys';
import type { MemoryQuery } from './query';
import { requireMemory } from './types';

interface Frontier { anchor: RpgAddress; direction: Direction; source: RpgSource }
interface FrontierPage {
  kind: 'frontiers'; status: 'ready'; floor: number; snapshotId: string;
  frontiers: Frontier[]; truncated: boolean; next?: string;
}

/** Current-receipt boundaries only, ordered by row, column, then north/east/south/west. */
export async function rpgFrontiers(query: MemoryQuery,
  input: { limit: number; snapshotId?: string; after?: string }): Promise<FrontierPage> {
  requireMemory(input && integer(input.limit, 1, 12));
  const { limit, snapshotId, after } = input, { head, tree, cell } = query;
  const observation = head.observation, floor = observation.actor.floor;
  requireMemory(validId(head.id) && head.id === observation.id && head.gameId === observation.gameId
    && validAddress(observation.actor) && Array.isArray(observation.cells)
    && observation.cells.length > 0 && observation.cells.length <= LIMITS.observationCells);
  requireMemory(snapshotId === undefined || validId(snapshotId) && snapshotId === head.id);
  requireMemory(after === undefined || typeof after === 'string' && after.length > 0 && after.length <= 2048
    && snapshotId !== undefined);

  const source = sourceOf(observation);
  const cursor = (anchor: RpgAddress, direction: Direction) =>
    JSON.stringify(['rpg-frontiers-v1', source.gameId, head.id, floor, anchor.row, anchor.column, direction]);
  const candidates = [...observation.cells].sort((a, b) => a.address.row - b.address.row || a.address.column - b.address.column)
    .flatMap(observed => directions.flatMap(direction => {
      if (observed.links.includes(direction) || observed.blocked.includes(direction)) return [];
      const address = { floor, ...movePosition(observed.address, direction) };
      return validAddress(address) ? [{ anchor: observed.address, direction, address, cursor: cursor(observed.address, direction) }] : [];
    }));
  // Exact comparison to this bounded public candidate set rejects malformed or foreign cursors.
  const start = after === undefined ? -1 : candidates.findIndex(candidate => candidate.cursor === after);
  requireMemory(after === undefined || start >= 0);
  const known = new Map<string, boolean>();
  const remembered = async (address: RpgAddress) => {
    const key = cellMemoryKey(address);
    if (!known.has(key)) known.set(key, (await cell(await tree.get(key), address)) !== undefined);
    return known.get(key)!;
  };
  if (start >= 0) requireMemory(!await remembered(candidates[start].address));

  const frontiers: Frontier[] = [];
  let last: string | undefined, truncated = false;
  for (const candidate of candidates.slice(start + 1)) {
    if (await remembered(candidate.address)) continue;
    if (frontiers.length === limit) { truncated = true; break; }
    frontiers.push({ anchor: candidate.anchor, direction: candidate.direction, source });
    last = candidate.cursor;
  }
  return freeze(structuredClone({ kind: 'frontiers', status: 'ready', floor, snapshotId: head.id, frontiers, truncated,
    ...(truncated ? { next: last! } : {}) } satisfies FrontierPage));
}
