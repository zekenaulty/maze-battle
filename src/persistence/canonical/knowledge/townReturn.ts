import { gameCheckpoint, type GameCheckpoint } from '../game/checkpoint';
import { check } from '../validation';
import { same } from '../world/records';
import type { WorldPosition } from '../world/types';
import { loadObservation, validateKnowledge } from './evidence';
import { observationKey } from './keys';
import { readKnownCells } from './queries';
import type { CellSource, KnowledgeRead, ObservationRef } from './types';

export interface TownReturn { at: WorldPosition; source: CellSource }

/** Owner binding candidate only. Read existing earned evidence; never navigate or acquire sight. */
export async function readTownReturn(pages: KnowledgeRead, input: GameCheckpoint): Promise<TownReturn> {
  const checkpoint = gameCheckpoint(input);
  const read: KnowledgeRead = {
    get: pages.get.bind(pages), scan: pages.scan.bind(pages), witness: pages.witness.bind(pages),
  };
  check(checkpoint.knowledge, 'town return requires earned observation');
  await validateKnowledge(read, checkpoint.knowledge);
  const currentRef = { sequence: checkpoint.knowledge.sequence, id: checkpoint.knowledge.id };
  const current = await loadObservation(read, currentRef);
  check(same(current.header.actor, checkpoint.position), 'town return observation differs from current position');

  function candidate(observation: Awaited<ReturnType<typeof loadObservation>>, ref: ObservationRef): TownReturn | undefined {
    check(observation.header.actor.level === 1, 'town return source is not floor 1');
    const found = observation.cells.flatMap((cell, index) => cell.stairs.includes('town')
      ? [{ at: cell.at, source: { ...ref, index } }] : []);
    check(found.length <= 1, 'ambiguous town return observation');
    return found[0];
  }

  let selected = checkpoint.position.level === 1 ? candidate(current, currentRef) : undefined;
  if (!selected) {
    const first = await read.get('knowledge', observationKey(1));
    check(first, 'missing initial town return observation');
    const ref = { sequence: 1, id: first.id };
    selected = candidate(await loadObservation(read, ref), ref);
  }
  check(selected, 'initial observation has no town return');
  const [known] = await readKnownCells(read, checkpoint, [selected.at]);
  check(known.state !== 'unknown' && known.cell.at.level === 1 && known.cell.stairs.includes('town')
    && same(known.cell.at, selected.at), 'town return is not supported by current memory');
  return structuredClone(selected);
}
