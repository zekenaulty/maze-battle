import type { GridPosition } from '../../../domain/types';
import type { GameCheckpoint } from '../game/checkpoint';
import { check, jsonBytes } from '../validation';
import { same } from '../world/records';
import { loadObservation, sourceReader, validateKnowledge } from './evidence';
import { blockKey, localKey } from './keys';
import { loadMemoryBlock, validateCellEvidence } from './memory';
import { DIRECTIONS, type KnowledgeRead, type MemoryBlock, type RememberedCell } from './types';
import { loadWorldIndexBlock, worldBlockKey, worldCellKey, type WorldIndexBlock } from './worldIndex';

// Logical knowledge reads, not B-tree IO. The caller's transaction budget still applies.
export const MAX_FRONTIER_READS = 256;
export const MAX_FRONTIER_READ_BYTES = 1024 * 1024;
function boundedPages(input: KnowledgeRead): KnowledgeRead {
  let reads = 0, bytes = 0;
  const cache = new Map<string, Awaited<ReturnType<KnowledgeRead['get']>>>();
  const charge = <T>(value: T) => {
    bytes += value === undefined ? 0 : jsonBytes(value, MAX_FRONTIER_READ_BYTES);
    check(bytes <= MAX_FRONTIER_READ_BYTES, 'frontier byte budget exhausted'); return value;
  };
  const read = () => check(++reads <= MAX_FRONTIER_READS, 'frontier read budget exhausted');
  return {
    async get(area, key) {
      check(area === 'knowledge', 'frontiers require knowledge only');
      if (!cache.has(key)) { read(); cache.set(key, charge(await input.get(area, key))); }
      return structuredClone(cache.get(key));
    },
    async witness(area, prefix) {
      check(area === 'knowledge', 'frontiers require knowledge only'); read(); return charge(await input.witness(area, prefix));
    },
    async scan() { throw Error('Frontiers cannot scan'); },
  };
}

export async function frontierReader(input: KnowledgeRead, checkpoint: GameCheckpoint) {
  const pages = boundedPages(input), anchor = checkpoint.knowledge;
  await validateKnowledge(pages, anchor);
  check(anchor && checkpoint.mode !== 'town', 'current frontier sight unavailable');
  const current = await loadObservation(pages, { sequence: anchor.sequence, id: anchor.id });
  check(same(current.header.actor, checkpoint.position), 'current frontier sight is stale');
  const visible = new Map(current.cells.map(c => [worldCellKey(c.world), c]));
  check(visible.size === current.cells.length, 'contradictory visible spatial coordinates');
  const spatial = new Map<string, WorldIndexBlock | null>(), memories = new Map<string, MemoryBlock | null>();
  const cells = new Map<string, RememberedCell | null>(), known = new Map<string, RememberedCell>(), source = sourceReader(pages);
  const floor = checkpoint.position.level;
  const absent = (world: GridPosition) => {
    const key = worldCellKey(world);
    check(!visible.has(key) && !known.has(key), 'earned memory is missing from spatial index');
  };
  async function cellAt(world: GridPosition): Promise<RememberedCell | null> {
    const key = worldCellKey(world);
    if (cells.has(key)) { if (!cells.get(key)) absent(world); return cells.get(key)!; }
    const sk = worldBlockKey(floor, world);
    if (!spatial.has(sk)) spatial.set(sk, await loadWorldIndexBlock(pages, floor, world));
    const entry = spatial.get(sk)?.cells[key];
    if (!entry) { absent(world); cells.set(key, null); return null; }
    const mk = blockKey(entry.at);
    if (!memories.has(mk)) {
      const block = await loadMemoryBlock(pages, entry.at); memories.set(mk, block);
      for (const cell of Object.values(block?.cells ?? {})) {
        const wk = worldCellKey(cell.world), old = known.get(wk);
        check(!old || same(old, cell), 'conflicting remembered spatial coordinates'); known.set(wk, cell);
      }
    }
    const cell = memories.get(mk)?.cells[localKey(entry.at)];
    check(cell && same(cell.at, entry.at) && same(cell.world, world) && same(cell.source, entry.source),
      'spatial index differs from earned memory');
    check(cell.source.sequence <= anchor!.sequence, 'frontier memory is ahead of checkpoint');
    await validateCellEvidence(cell, source);
    const seen = visible.get(key);
    if (seen) check(same({ ...seen, edges: {} }, { at: cell.at, world: cell.world, chests: cell.chests, stairs: cell.stairs, edges: {} })
      && DIRECTIONS.every(d => !Object.hasOwn(seen.edges, d) || cell.edges[d] && same(cell.edges[d]!.target, seen.edges[d])),
    'visible frontier fact differs from current observation');
    cells.set(key, cell); return cell;
  }
  // Validate every visible anchor before using an absent spatial entry as a boundary.
  for (const seen of current.cells) await cellAt(seen.world);
  return { current, cellAt, absent };
}
