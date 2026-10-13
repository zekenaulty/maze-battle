import type { GameCheckpoint } from '../game/checkpoint';
import type { WorldPosition } from '../world/types';
import { check, integer } from '../validation';
import { fields, id, natural } from '../roster/codec';
import { same } from '../world/records';
import { blockKey, cellKey, localKey, roomKey } from './keys';
import { sourceReader, validateKnowledge, loadObservation } from './evidence';
import { boundedCellQuery, loadMemoryBlock, validateCellEvidence } from './memory';
import { cellSource } from './validation';
import type { KnowledgeRead, MemoryBlock } from './types';
import { DIRECTIONS } from './types';

/** Shared human/agent projection. No authoritative world or roster read is permitted here. */
export async function readKnownCells(pages: KnowledgeRead, checkpoint: GameCheckpoint, positions: WorldPosition[]) {
  boundedCellQuery(positions); await validateKnowledge(pages, checkpoint.knowledge);
  const current = checkpoint.knowledge ? await loadObservation(pages, { sequence: checkpoint.knowledge.sequence, id: checkpoint.knowledge.id }) : null;
  const visible = new Set(checkpoint.mode !== 'town' && current && same(current.header.actor, checkpoint.position) ? current.cells.map(c => cellKey(c.at)) : []);
  const blocks = new Map<string, MemoryBlock | null>(), readSource = sourceReader(pages), result = [];
  for (const at of positions) {
    const key = blockKey(at);
    if (!blocks.has(key)) blocks.set(key, await loadMemoryBlock(pages, at));
    const cell = blocks.get(key)?.cells[localKey(at)];
    if (!cell) { check(!visible.has(cellKey(at)), 'current observation is missing from memory'); result.push({ at, state: 'unknown' as const }); continue; }
    check(checkpoint.knowledge && cell.source.sequence <= checkpoint.knowledge.sequence, 'memory is ahead of checkpoint');
    await validateCellEvidence(cell, readSource);
    if (visible.has(cellKey(at))) {
      const seen = current!.cells.find(c => cellKey(c.at) === cellKey(at))!;
      // Unchanged facts retain their original source; the new receipt proves renewed visibility.
      check(same({ ...seen, edges: {} }, { at: cell.at, world: cell.world, chests: cell.chests, stairs: cell.stairs, edges: {} })
        && DIRECTIONS.every(d => !Object.hasOwn(seen.edges, d) || cell.edges[d] && same(cell.edges[d]!.target, seen.edges[d])),
      'visible fact differs from current observation');
    }
    result.push({ at, state: visible.has(cellKey(at)) ? 'visible' as const : 'remembered' as const, cell });
  }
  return result;
}

/** Known rooms only, never the generated room list. Use readKnownCells for scoped detail. */
export async function listKnownRooms(pages: KnowledgeRead, checkpoint: GameCheckpoint, level: number, after?: string, limit = 12) {
  natural(level, 1); check(integer(limit, 1) && limit <= 16, 'invalid known-room page size');
  await validateKnowledge(pages, checkpoint.knowledge);
  const prefix = `known-rooms/${level}/`, page = await pages.scan('knowledge', prefix, after, limit), source = sourceReader(pages), rooms = [];
  for (const row of page.rows) {
    const r = fields(row.value, 'schema level spaceId source'); id(r.spaceId); cellSource(r.source);
    check(r.schema === 1 && r.level === level && row.key === roomKey(level, r.spaceId) && checkpoint.knowledge
      && r.source.sequence <= checkpoint.knowledge.sequence && same(row.indexes, [`${prefix}${r.spaceId}`]), 'invalid known-room membership');
    const seen = await source(r.source);
    check(seen.at.level === level && seen.at.cell.spaceId === r.spaceId, 'room is not supported by observed evidence');
    rooms.push({ level, spaceId: r.spaceId, source: r.source });
  }
  return { rooms, ...(page.next === undefined ? {} : { next: page.next }) };
}
