import type { Direction } from '../../../domain/types';
import { movePosition } from '../../../domain/maze/movement';
import { gameCheckpoint, type GameCheckpoint } from '../game/checkpoint';
import { fields } from '../roster/codec';
import { check } from '../validation';
import { position, same } from '../world/records';
import type { WorldPosition } from '../world/types';
import { frontierReader } from './frontiers.read';
import { cellSource } from './validation';
import { DIRECTIONS, type CellSource, type KnowledgeRead } from './types';

export interface FrontierSelection { at: WorldPosition; direction: Direction; source: CellSource }
export function frontierSelection(input: unknown): FrontierSelection {
  const value = fields(input, 'at direction source'), at = fields(value.at, 'level cell');
  fields(at.cell, 'spaceId row column'); position(value.at as unknown as WorldPosition); cellSource(value.source);
  check(DIRECTIONS.includes(value.direction as Direction), 'invalid frontier direction');
  return structuredClone(value) as unknown as FrontierSelection;
}

/** Current sight only, at most 113 anchors x four directions; no world reads or history scans.
 * Missing spatial entries use the earned index, never a guess about hidden geometry.
 * Logical reads/bytes are capped by frontierReader; exhaustion throws, not an empty result.
 */
export async function readFrontiers(pages: KnowledgeRead, input: GameCheckpoint): Promise<FrontierSelection[]> {
  const checkpoint = gameCheckpoint(input), reader = await frontierReader(pages, checkpoint);
  const { current } = reader, actor = current.cells.find(c => same(c.at, checkpoint.position))!;
  const candidates: { selection: FrontierSelection; row: number; column: number }[] = [];
  for (let index = 0; index < current.cells.length; index++) {
    const seen = current.cells[index], memory = (await reader.cellAt(seen.world))!;
    if (same(seen.world, actor.world)) continue;
    for (const direction of DIRECTIONS) {
      if (Object.hasOwn(seen.edges, direction) || Object.hasOwn(memory.edges, direction)) continue;
      if (await reader.cellAt(movePosition(seen.world, direction))) continue;
      candidates.push({ selection: { at: seen.at, direction, source: {
        sequence: checkpoint.knowledge!.sequence, id: checkpoint.knowledge!.id, index,
      } }, row: seen.world.row, column: seen.world.column });
    }
  }
  // A later neighbor probe may have loaded memory contradicting an earlier absent entry.
  for (const c of candidates) reader.absent(movePosition({ row: c.row, column: c.column }, c.selection.direction));
  candidates.sort((a, b) => a.row - b.row || a.column - b.column
    || DIRECTIONS.indexOf(a.selection.direction) - DIRECTIONS.indexOf(b.selection.direction));
  return candidates.map(c => structuredClone(c.selection));
}

/** Membership is disclosure validation only; callers must recheck in their admission transaction. */
export async function isCurrentFrontier(pages: KnowledgeRead, checkpoint: GameCheckpoint, input: FrontierSelection): Promise<boolean> {
  const selection = frontierSelection(input);
  return (await readFrontiers(pages, checkpoint)).some(candidate => same(candidate, selection));
}
