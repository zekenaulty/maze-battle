import type { CanonicalWork } from '../transaction';
import { check, integer } from '../validation';
import { json } from '../world/records';
import type { GameCheckpoint } from '../game/checkpoint';
import { KNOWLEDGE_PREFIX, observationKey } from './keys';
import { observePosition } from './observe';
import { validateKnowledge } from './evidence';
import { rememberObservation } from './memory';
import { OBSERVATION_CHUNK_SIZE, VISION_RADIUS, type ObservationHeader } from './types';

/** Position/effects, sight, memory and source receipts share the caller's transaction. */
export async function recordGameObservation(tx: CanonicalWork, checkpoint: GameCheckpoint): Promise<GameCheckpoint> {
  check(checkpoint.mode !== 'town', 'town has no dungeon observation');
  await validateKnowledge(tx.pages, checkpoint.knowledge);
  const cells = await observePosition(tx.pages, checkpoint.position), sequence = (checkpoint.knowledge?.sequence ?? 0) + 1;
  check(integer(sequence, 1), 'observation sequence exhausted');
  const key = observationKey(sequence);
  check(!await tx.pages.get('knowledge', key), 'observation sequence already exists');
  const chunks: string[] = [];
  for (let start = 0; start < cells.length; start += OBSERVATION_CHUNK_SIZE) {
    const chunkKey = `${key}/${chunks.length}`;
    check(!await tx.pages.get('knowledge', chunkKey), 'observation chunk already exists');
    const row = await tx.pages.set('knowledge', chunkKey, json({ schema: 1, sequence, offset: start, cells: cells.slice(start, start + OBSERVATION_CHUNK_SIZE) }));
    chunks.push(row.id);
  }
  const header: ObservationHeader = { schema: 1, sequence, previous: checkpoint.knowledge
    ? { sequence: checkpoint.knowledge.sequence, id: checkpoint.knowledge.id } : null,
    owner: tx.head.owner, epoch: tx.head.epoch, revision: tx.head.revision + 1, observedAt: new Date().toISOString(),
    actor: structuredClone(checkpoint.position), policy: 'linked-vision-v1', radius: VISION_RADIUS, count: cells.length, chunks };
  const row = await tx.pages.set('knowledge', key, json(header));
  await rememberObservation(tx.pages, cells, { sequence, id: row.id });
  const witness = await tx.pages.witness('knowledge', KNOWLEDGE_PREFIX); check(witness, 'missing observation namespace');
  return { ...checkpoint, knowledge: { sequence, id: row.id, witness } };
}
