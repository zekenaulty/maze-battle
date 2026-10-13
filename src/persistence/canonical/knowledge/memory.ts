import { check, integer } from '../validation';
import { fields } from '../roster/codec';
import { json, same } from '../world/records';
import type { CanonicalPages } from '../pages';
import type { WorldPosition } from '../world/types';
import { blockAddress, blockKey, cellKey, localKey, roomKey } from './keys';
import { cellSource, observedCell } from './validation';
import { DIRECTIONS, MEMORY_BLOCK_SIDE, type CellSource, type KnowledgeRead, type MemoryBlock, type ObservedCell, type RememberedCell } from './types';

export async function loadMemoryBlock(pages: KnowledgeRead, at: WorldPosition) {
  const record = await pages.get('knowledge', blockKey(at)); if (!record) return null;
  const block = fields(record.value, 'schema level spaceId row column cells');
  const expected = blockAddress(at);
  check(block.schema === 1 && block.level === expected.level && block.spaceId === expected.spaceId
    && block.row === expected.row && block.column === expected.column, 'foreign memory block');
  check(block.cells && typeof block.cells === 'object' && !Array.isArray(block.cells)
    && Object.keys(block.cells).length <= MEMORY_BLOCK_SIDE ** 2, 'unbounded memory block');
  for (const [key, cell] of Object.entries(block.cells)) {
    validateRememberedCell(cell);
    check(key === localKey(cell.at) && same(blockAddress(cell.at), expected), 'memory cell outside its block');
  }
  return record.value as unknown as MemoryBlock;
}
export function validateRememberedCell(value: unknown): asserts value is RememberedCell {
  const c = fields(value, 'at world edges chests stairs source'); cellSource(c.source);
  const edges = fields(c.edges, '', DIRECTIONS.join(' ')), projected: ObservedCell['edges'] = {};
  for (const d of DIRECTIONS) {
    if (!Object.hasOwn(edges, d)) continue;
    const edge = fields(edges[d], 'target source'); cellSource(edge.source);
    check(edge.source.sequence <= c.source.sequence, 'future edge evidence');
    projected[d] = edge.target as WorldPosition | null;
  }
  observedCell({ at: c.at, world: c.world, chests: c.chests, stairs: c.stairs, edges: projected });
}

export async function rememberObservation(pages: CanonicalPages, cells: ObservedCell[], reference: { sequence: number; id: string }) {
  const blocks = new Map<string, MemoryBlock>(), rooms = new Set<string>();
  for (let index = 0; index < cells.length; index++) {
    const seen = cells[index], source: CellSource = { ...reference, index }, key = blockKey(seen.at);
    let block = blocks.get(key);
    if (!block) { block = await loadMemoryBlock(pages, seen.at) ?? { schema: 1, ...blockAddress(seen.at), cells: {} }; blocks.set(key, block); }
    const old = block.cells[localKey(seen.at)];
    if (old) check(old.source.sequence < reference.sequence, 'memory would rewind its evidence');
    const edges = { ...old?.edges };
    for (const d of DIRECTIONS) if (Object.hasOwn(seen.edges, d)) edges[d] = { target: seen.edges[d]!, source };
    block.cells[localKey(seen.at)] = { ...seen, source, edges };
    const rk = roomKey(seen.at.level, seen.at.cell.spaceId);
    if (!rooms.has(rk)) {
      rooms.add(rk);
      if (!await pages.get('knowledge', rk)) await pages.set('knowledge', rk,
        json({ schema: 1, level: seen.at.level, spaceId: seen.at.cell.spaceId, source }), [`known-rooms/${seen.at.level}/${seen.at.cell.spaceId}`]);
    }
  }
  for (const [key, block] of blocks) await pages.set('knowledge', key, json(block));
}

export async function validateCellEvidence(cell: RememberedCell, readSource: (source: CellSource) => Promise<ObservedCell>) {
  const seen = await readSource(cell.source);
  check(same({ ...seen, edges: {} }, { at: cell.at, world: cell.world, chests: cell.chests, stairs: cell.stairs, edges: {} }),
    'remembered facts differ from source evidence');
  for (const d of DIRECTIONS) {
    const edge = cell.edges[d]; if (!edge) continue;
    const source = await readSource(edge.source);
    check(cellKey(source.at) === cellKey(cell.at) && Object.hasOwn(source.edges, d) && same(source.edges[d], edge.target),
      'remembered edge differs from source evidence');
  }
}

export function boundedCellQuery(positions: WorldPosition[]) {
  check(Array.isArray(positions) && integer(positions.length, 1) && positions.length <= 64, 'cell query must contain 1-64 addresses');
  positions.forEach(blockAddress);
  check(new Set(positions.map(cellKey)).size === positions.length, 'duplicate cell query');
}
