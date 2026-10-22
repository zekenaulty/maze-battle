import { check, integer } from '../validation';
import { observationKey } from './keys';
import { observationDigest, readObservationIntegrity } from './observation.integrity';
import { observationChunkRecord, observationCoverage, observationHeaderRecord } from './observation.validation';
import { cellSource, observationRef } from './validation';
import { OBSERVATION_CHUNK_SIZE, type CellSource, type KnowledgeRead, type ObservationRef, type ObservedCell } from './types';

export async function readObservationHeader(pages: KnowledgeRead, input: ObservationRef) {
  observationRef(input); const reference = structuredClone(input);
  const parent = structuredClone(await pages.get('knowledge', observationKey(reference.sequence)));
  const header = observationHeaderRecord(parent, reference);
  const digests = await readObservationIntegrity(pages, parent!);
  return { parent: parent!, header, digests };
}

type Observation = Awaited<ReturnType<typeof readObservationHeader>>;
export async function readCompleteObservation(pages: KnowledgeRead, reference: ObservationRef) {
  const observation = await readObservationHeader(pages, reference), cells: ObservedCell[] = [];
  for (let i = 0; i < observation.header.chunks.length; i++) cells.push(...await readObservationChunk(pages, observation, i));
  observationCoverage(observation.header, cells);
  return { header: observation.header, cells };
}

export async function readObservationChunk(pages: KnowledgeRead, observation: Observation, index: number) {
  const { parent, header, digests } = structuredClone(observation);
  check(integer(index) && index < header.chunks.length, 'invalid observation chunk index');
  const row = await pages.get('knowledge', `${observationKey(header.sequence)}/${index}`);
  const cells = observationChunkRecord(row, parent, header, index);
  check(observationDigest(row!) === digests[index], 'observation chunk integrity changed');
  return cells;
}

/** Exact selected bytes only. Whole-observation coverage was checked when the manifest was written. */
export function selectiveSourceReader(pages: KnowledgeRead) {
  const observations = new Map<string, Observation>(), chunks = new Map<string, ObservedCell[]>();
  return async (input: CellSource) => {
    cellSource(input); const source = structuredClone(input), key = `${source.sequence}:${source.id}`;
    let observation = observations.get(key);
    if (!observation) {
      observation = await readObservationHeader(pages, { sequence: source.sequence, id: source.id }); observations.set(key, observation);
    }
    check(source.index < observation.header.count, 'invalid cell source');
    const index = Math.floor(source.index / OBSERVATION_CHUNK_SIZE), chunkKey = `${key}/${index}`;
    let cells = chunks.get(chunkKey);
    if (!cells) { cells = await readObservationChunk(pages, observation, index); chunks.set(chunkKey, cells); }
    return structuredClone(cells[source.index % OBSERVATION_CHUNK_SIZE]);
  };
}
