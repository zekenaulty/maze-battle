import type { AgenticaObservation } from '../contracts';
import { readPublication } from '../../../persistence/canonical/agentica/publication';
import { equal, snapshotJson, snapshotReference } from '../../../persistence/canonical/agentica/validation';
import type { ProtocolRef } from '../../../persistence/canonical/agentica/types';
import { gameCheckpoint } from '../../../persistence/canonical/game/checkpoint';
import { loadObservation, validateKnowledge } from '../../../persistence/canonical/knowledge/evidence';
import type { CanonicalSnapshot } from '../../../persistence/canonical/types';
import { check, integer, jsonBytes } from '../../../persistence/canonical/validation';
import { MAX_OBSERVATION_BYTES, MAX_PERCEPTION_READ_BYTES, MAX_PERCEPTION_READS, type PerceptionPages } from './types';

function boundedPages(input: PerceptionPages, ref: ProtocolRef): PerceptionPages {
  let reads = 0, bytes = 0;
  const cache = new Map<string, Awaited<ReturnType<PerceptionPages['get']>>>();
  const charge = <T>(value: T) => {
    bytes += value === undefined ? 0 : jsonBytes(value, MAX_PERCEPTION_READ_BYTES);
    check(bytes <= MAX_PERCEPTION_READ_BYTES, 'perception byte budget exhausted'); return value;
  };
  const read = () => check(++reads <= MAX_PERCEPTION_READS, 'perception read budget exhausted');
  return {
    async get(area, key) {
      check(area === 'knowledge', 'perception cannot read world or execution records');
      if (!cache.has(key)) { read(); cache.set(key, charge(await input.get(area, key))); }
      return structuredClone(cache.get(key));
    },
    async scan(area, prefix, after, limit) {
      check(area === 'knowledge' && prefix.startsWith('known-rooms/') && integer(limit, 1) && limit <= 4, 'unbounded perception scan');
      read(); return charge(await input.scan(area, prefix, after, limit));
    },
    async witness(area, prefix) { check(area === 'knowledge', 'perception cannot witness world'); read(); return charge(await input.witness(area, prefix)); },
    async savedSnapshot(key) { check(key === ref.key, 'foreign perception publication'); read(); return charge(await input.savedSnapshot(key)); },
    async sourceReceipt() { throw Error('Perception source receipts are validated by the publication reader'); },
  };
}

/** Caller supplies the snapshot belonging to its transaction/read. No fresh sight or world queries. */
export async function perceptionContext(input: PerceptionPages, view: CanonicalSnapshot, reference: ProtocolRef) {
  const snapshot = snapshotJson(view, 8192), ref = snapshotReference(reference), pages = boundedPages(input, ref);
  const publication = await readPublication(pages, ref), retained = publication.snapshot;
  check(snapshot.generation === retained.generation && snapshot.gameId === retained.gameId && integer(snapshot.revision)
    && snapshot.revision >= retained.revision && equal(snapshot.checkpoint, retained.checkpoint)
    && equal({ world: snapshot.roots.world, knowledge: snapshot.roots.knowledge }, retained.roots), 'perception snapshot differs from publication');
  const checkpoint = gameCheckpoint(retained.checkpoint);
  await validateKnowledge(pages, checkpoint.knowledge);
  const sight = checkpoint.knowledge ? await loadObservation(pages, { sequence: checkpoint.knowledge.sequence, id: checkpoint.knowledge.id }) : null;
  check(!sight || sight.header.revision <= retained.revision, 'perception source is ahead of publication');
  return { pages, checkpoint, publication, ref, sight };
}
export type PerceptionContext = Awaited<ReturnType<typeof perceptionContext>>;
export function observation(context: PerceptionContext, data: Record<string, unknown>, max = MAX_OBSERVATION_BYTES): AgenticaObservation {
  const value = { observationId: context.ref.id, revision: context.publication.wireRevision,
    observedAt: context.sight?.header.observedAt ?? context.checkpoint.updatedAt, data };
  jsonBytes(value, max); return value;
}
