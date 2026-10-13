import type { GridPosition } from '../../../domain/types';
import type { CanonicalPages } from '../pages';
import { fields } from '../roster/codec';
import { check, integer } from '../validation';
import { json, same } from '../world/records';
import type { WorldPosition } from '../world/types';
import { blockKey, KNOWLEDGE_PREFIX, localKey } from './keys';
import { loadMemoryBlock } from './memory';
import { cellPosition, cellSource } from './validation';
import { MAX_VISIBLE_CELLS, type CellSource, type KnowledgeRead, type MemoryBlock, type ObservedCell } from './types';

export const WORLD_BLOCK_SIDE = 4;
export interface WorldCellIndex { at: WorldPosition; world: GridPosition; source: CellSource }
export interface WorldIndexBlock {
  schema: 1; floor: number; row: number; column: number; cells: Record<string, WorldCellIndex>;
}
export const worldCellKey = (world: GridPosition) => `${world.row}:${world.column}`;
export function worldBlockAddress(floor: number, world: GridPosition) {
  check(integer(floor, 1) && Number.isSafeInteger(world.row) && Number.isSafeInteger(world.column), 'invalid world index coordinates');
  return { floor, row: Math.floor(world.row / WORLD_BLOCK_SIDE), column: Math.floor(world.column / WORLD_BLOCK_SIDE) };
}
export function worldBlockKey(floor: number, world: GridPosition) {
  const b = worldBlockAddress(floor, world);
  return `${KNOWLEDGE_PREFIX}world/${b.floor}/${b.row}:${b.column}`;
}
export async function loadWorldIndexBlock(pages: KnowledgeRead, floor: number, world: GridPosition) {
  const row = await pages.get('knowledge', worldBlockKey(floor, world));
  if (!row) return null;
  const b = fields(row.value, 'schema floor row column cells'), expected = worldBlockAddress(floor, world);
  check(b.schema === 1 && b.floor === floor && b.row === expected.row && b.column === expected.column, 'foreign world index block');
  check(b.cells && typeof b.cells === 'object' && !Array.isArray(b.cells)
    && Object.keys(b.cells).length <= WORLD_BLOCK_SIDE ** 2, 'unbounded world index block');
  for (const [key, value] of Object.entries(b.cells)) {
    const c = fields(value, 'at world source'); cellPosition(c.at); cellSource(c.source);
    const point = fields(c.world, 'row column') as unknown as GridPosition;
    check(c.at.level === floor && key === worldCellKey(point) && same(worldBlockAddress(floor, point), expected), 'foreign world index cell');
  }
  return row.value as unknown as WorldIndexBlock;
}

/** After memory updates, copy only changed earned mappings. Never consult world geometry. */
export async function indexObservedWorldCells(pages: CanonicalPages, cells: ObservedCell[]) {
  check(cells.length <= MAX_VISIBLE_CELLS, 'unbounded spatial update');
  const blocks = new Map<string, WorldIndexBlock>(), memories = new Map<string, MemoryBlock>(), changed = new Set<string>();
  for (const seen of cells) {
    const memoryKey = blockKey(seen.at);
    let memory = memories.get(memoryKey);
    if (!memory) {
      memory = await loadMemoryBlock(pages, seen.at) ?? undefined;
      check(memory, 'spatial update requires earned memory'); memories.set(memoryKey, memory);
    }
    const cell = memory.cells[localKey(seen.at)];
    check(cell && same(cell.world, seen.world), 'spatial update differs from earned memory');
    const key = worldBlockKey(seen.at.level, seen.world);
    let block = blocks.get(key);
    if (!block) {
      block = await loadWorldIndexBlock(pages, seen.at.level, seen.world)
        ?? { schema: 1, ...worldBlockAddress(seen.at.level, seen.world), cells: {} };
      blocks.set(key, block);
    }
    const coordinate = worldCellKey(seen.world), old = block.cells[coordinate];
    check(!old || same(old.at, seen.at), 'conflicting earned world coordinate');
    const next: WorldCellIndex = { at: cell.at, world: cell.world, source: cell.source };
    if (!old || !same(old, next)) { block.cells[coordinate] = next; changed.add(key); }
  }
  for (const key of changed) await pages.set('knowledge', key, json(blocks.get(key)!));
}
