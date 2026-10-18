import { gameCheckpoint, type GameCheckpoint } from '../game/checkpoint';
import { check, jsonBytes } from '../validation';
import { same } from '../world/records';
import { loadObservation, validateKnowledge } from './evidence';
import { readKnownCells } from './queries';
import { MAX_VISIBLE_CELLS, type KnowledgeRead, type ObservedCell } from './types';
import { loadWorldIndexBlock, worldBlockKey, worldCellKey, type WorldIndexBlock } from './worldIndex';

// Pre-move view: logical record reads/bytes, not physical index IO. No history scans.
export const MAX_EXPLORATION_READS = 256;
export const MAX_EXPLORATION_READ_BYTES = 1024 * 1024;

export function explorationPages(input: KnowledgeRead): KnowledgeRead {
  const cache = new Map<string, Awaited<ReturnType<KnowledgeRead['get']>>>();
  let reads = 0, bytes = 0;
  const read = () => check(++reads <= MAX_EXPLORATION_READS, 'exploration read budget exhausted');
  const charge = <T>(value: T) => {
    bytes += value === undefined ? 0 : jsonBytes(value, MAX_EXPLORATION_READ_BYTES);
    check(bytes <= MAX_EXPLORATION_READ_BYTES, 'exploration byte budget exhausted'); return value;
  };
  return {
    async get(area, key) {
      check(area === 'knowledge', 'exploration requires knowledge only');
      if (!cache.has(key)) { read(); cache.set(key, charge(await input.get(area, key))); }
      return structuredClone(cache.get(key));
    },
    async witness(area, prefix) {
      check(area === 'knowledge', 'exploration requires knowledge only'); read(); return charge(await input.witness(area, prefix));
    },
    async scan() { throw Error('Exploration cannot scan'); },
  };
}

export async function explorationView(input: KnowledgeRead, before: GameCheckpoint) {
  const checkpoint = gameCheckpoint(before), pages = explorationPages(input), anchor = checkpoint.knowledge;
  check(anchor && checkpoint.mode !== 'town', 'current exploration sight unavailable');
  await validateKnowledge(pages, anchor);
  const current = await loadObservation(pages, { sequence: anchor.sequence, id: anchor.id });
  check(same(current.header.actor, checkpoint.position), 'current exploration sight is stale');
  check(new Set(current.cells.map(c => `${c.world.row}:${c.world.column}`)).size === current.cells.length,
    'contradictory exploration spatial coordinates');
  const spatial = new Map<string, WorldIndexBlock | null>();
  async function known(cells: ObservedCell[]) {
    check(cells.length > 0 && cells.length <= MAX_VISIBLE_CELLS, 'unbounded exploration comparison');
    const result: Awaited<ReturnType<typeof readKnownCells>> = [];
    for (let i = 0; i < cells.length; i += 64) result.push(...await readKnownCells(pages, checkpoint, cells.slice(i, i + 64).map(c => c.at)));
    for (let i = 0; i < cells.length; i++) {
      const seen = cells[i], prior = result[i], key = worldBlockKey(seen.at.level, seen.world);
      if (!spatial.has(key)) spatial.set(key, await loadWorldIndexBlock(pages, seen.at.level, seen.world));
      const entry = spatial.get(key)?.cells[worldCellKey(seen.world)];
      if (prior.state === 'unknown') check(!entry, 'earned exploration memory is missing');
      else check(entry && same(prior.cell.world, seen.world) && same(entry.at, seen.at)
        && same(entry.source, prior.cell.source), 'exploration spatial evidence differs from memory');
    }
    return result;
  }
  // Validate current memory even if an early cell already supplies a material stop.
  await known(current.cells);
  return { checkpoint, anchor, current, known };
}
