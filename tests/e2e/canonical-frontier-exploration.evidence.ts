import { canonicalJson } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { readCanonical } from '../../src/persistence/canonical/read';
import { gameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';
import { DEFAULT_WORK_LIMITS, type CanonicalRecord, type CanonicalSnapshot } from '../../src/persistence/canonical/types';
import { fields } from '../../src/persistence/canonical/roster/codec';
import { json, same } from '../../src/persistence/canonical/world/records';
import { KNOWLEDGE_PREFIX, observationKey } from '../../src/persistence/canonical/knowledge/keys';
import { observationChunksDigest, observationDigest, observationIntegrityKey } from '../../src/persistence/canonical/knowledge/observation.integrity';
import type { KnowledgeRead } from '../../src/persistence/canonical/knowledge/types';
import type { FrontierSelection } from '../../src/persistence/canonical/knowledge/frontiers';
import * as knowledge from './canonical-knowledge-fixture';
import { knowledgeOnly, query } from './canonical-frontier.support';

export async function captureExplorationFrame() {
  const observed = await knowledge.current(), page = await query(observed.snapshot);
  return { frame: { sight: observed.value, frontiers: page.value, accesses: page.accesses }, snapshot: observed.snapshot };
}
export async function readExplorationFrame() { return (await captureExplorationFrame()).frame; }
export type CapturedExplorationFrame = Awaited<ReturnType<typeof captureExplorationFrame>>;
export type ExplorationFrame = CapturedExplorationFrame['frame'];
export interface ExplorationSource { parent: CanonicalRecord; chunks: CanonicalRecord[]; integrity: CanonicalRecord }

const equal = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
function required(row: CanonicalRecord | undefined): CanonicalRecord {
  if (!row) throw Error('Missing captured observation record');
  return row;
}
async function verifySource(frame: ExplorationFrame, snapshot: CanonicalSnapshot, source: ExplorationSource) {
  const anchor = gameCheckpoint(snapshot.checkpoint).knowledge;
  if (!anchor) throw Error('Missing captured knowledge anchor');
  const rows = [source.parent, source.integrity, ...source.chunks], records = new Map(rows.map(row => [row.key, row]));
  if (records.size !== rows.length || source.chunks.length !== frame.sight.header.chunks.length)
    throw Error('Captured observation record set changed');
  const pages: KnowledgeRead = { get: async (area, key) => {
    if (area !== 'knowledge') throw Error('Observation proof attempted non-knowledge read');
    return records.get(key);
  }, scan: async () => { throw Error('Observation proof attempted scan'); },
  witness: async () => { throw Error('Copied records cannot supply a knowledge witness'); } };
  const sight = await knowledge.loadObservation(pages, { sequence: anchor.sequence, id: anchor.id });
  if (!equal(sight, frame.sight)) throw Error('Captured observation differs from retained source');
  if (observationChunksDigest(source.chunks.map(observationDigest)) !== sight.header.chunksDigest)
    throw Error('Captured ordered chunk commitment changed');
}

async function originalSource(snapshot: CanonicalSnapshot) {
  const accesses: string[] = [], records = new Map<string, CanonicalRecord>();
  const read = await readCanonical(async (pages, snapshot) => {
    const anchor = gameCheckpoint(snapshot.checkpoint).knowledge;
    if (!anchor) throw Error('Missing captured knowledge anchor');
    const only = knowledgeOnly(pages, accesses), witness = await only.witness('knowledge', KNOWLEDGE_PREFIX);
    if (witness !== anchor.witness) throw Error('Captured knowledge witness changed');
    const sight = await knowledge.loadObservation({ ...only, get: async (area, key) => {
      const row = await only.get(area, key); records.set(key, structuredClone(required(row))); return row;
    } }, { sequence: anchor.sequence, id: anchor.id });
    return { anchor, witness, source: { parent: required(records.get(observationKey(anchor.sequence))),
      chunks: sight.header.chunks.map((_, index) => required(records.get(`${observationKey(anchor.sequence)}/${index}`))),
      integrity: required(records.get(observationIntegrityKey(anchor.sequence))) } };
  }, { snapshot, limits: DEFAULT_WORK_LIMITS });
  return { ...read.value, snapshot: read.snapshot, accesses, stats: read.stats, limits: { ...DEFAULT_WORK_LIMITS } };
}

// Public observation only: no layout import, seed, variant, desired coordinate, or world accessor.
export function selectUnopenedObjectFrontier(frame: ExplorationFrame): FrontierSelection {
  const candidates = frame.frontiers.filter(frontier => frame.sight.cells.some(cell => same(cell.at, frontier.at)
    && cell.chests.some(chest => !chest.opened)));
  if (candidates.length !== 1) throw Error('Expected one earned unresolved direction at the newly observed chest');
  return structuredClone(candidates[0]);
}

/** Privileged test evidence, never planner input. Verify original pinned records before deriving any identity mapping. */
export function explorationComparison() {
  const roles = new Map<string, string>(), identities = new Map<string, string>();
  function identity(id: string, role: string) {
    if ((roles.has(role) && roles.get(role) !== id) || (identities.has(id) && identities.get(id) !== role))
      throw Error('Observation identity alias or replacement in A/B transcript');
    roles.set(role, id); identities.set(id, role); return role;
  }
  return async (input: CapturedExplorationFrame, supplied?: ExplorationSource) => {
    const { frame, snapshot } = structuredClone(input), copied = supplied && structuredClone(supplied), evidence = await originalSource(snapshot);
    const source = copied ?? evidence.source;
    await verifySource(frame, snapshot, source);
    if (!equal(source, evidence.source)) throw Error('Captured source differs from witnessed original');
    const { header, cells } = frame.sight;
    const envelope = (row: CanonicalRecord, role: string) => ({ ...row,
      generation: identity(row.generation, 'generation'), gameId: identity(row.gameId, 'game'), id: identity(row.id, role) });
    const chunks = source.chunks.map((row, index) => envelope(row, `chunk-${header.sequence}-${index}`));
    const chunkDigests = chunks.map(observationDigest), normalizedHeader = { ...header, observedAt: '<wall-clock>',
      previous: header.previous && { ...header.previous,
        id: identity(header.previous.id, `observation-${header.previous.sequence}`) },
      chunks: header.chunks.map((id, i) => identity(id, `chunk-${header.sequence}-${i}`)),
      chunksDigest: observationChunksDigest(chunkDigests) };
    const parent = { ...envelope(source.parent, `observation-${header.sequence}`), value: json(normalizedHeader) };
    const proof = fields(source.integrity.value, 'schema recordId revision headerDigest chunkDigests');
    const integrity = { ...envelope(source.integrity, `integrity-${header.sequence}`), value: json({ ...proof,
      recordId: parent.id, headerDigest: observationDigest(parent), chunkDigests }) };
    const value = { sight: { header: normalizedHeader, cells }, records: { parent, chunks, integrity },
      frontiers: frame.frontiers.map(frontier => ({ ...frontier, source: { ...frontier.source,
        id: identity(frontier.source.id, `observation-${frontier.source.sequence}`) } })) };
    return { evidence: { ...evidence, identities: [...identities] }, value };
  };
}
