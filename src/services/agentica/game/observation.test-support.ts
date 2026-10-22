import { knowledgeFixture, earnedCell } from '../../../persistence/canonical/knowledge/region.test-support';
import { protocolHead } from '../../../persistence/canonical/agentica/types.test-support';
import { checkpointJson } from '../../../persistence/canonical/game/checkpoint';
import { canonicalFence } from '../../../persistence/canonical/transaction';
import { snapshotOf } from '../../../persistence/canonical/read';
import type { CanonicalRecord, CanonicalRequest } from '../../../persistence/canonical/types';
import type { Publication } from '../../../persistence/canonical/agentica/types';
import type { ObservedCell } from '../../../persistence/canonical/knowledge/types';
import type { PerceptionPages } from './types';

export async function perceptionFixture(cells: ObservedCell[] = [earnedCell()]) {
  const knowledge = knowledgeFixture(); await knowledge.observe(cells);
  return perceptionPublication(knowledge);
}

export function perceptionPublication(knowledge: ReturnType<typeof knowledgeFixture>) {
  const stamp = () => {
    for (const [key, row] of knowledge.records) {
      row.key = key; row.indexes = key.startsWith('perception/room/') ? [`known-rooms/${key.slice('perception/room/'.length)}`] : [];
    }
  };
  stamp();
  const head = { ...protocolHead(), revision: 20, checkpoint: checkpointJson(knowledge.checkpoint()) };
  const request: CanonicalRequest = { attemptId: 'publication', expected: canonicalFence(head), operation: 'agentica.publish', input: {}, deadlineAt: null };
  const snapshot = snapshotOf(head), ref = { key: 'agentica/publications/publication', id: 'publication-record' };
  const publication: Publication = { schema: 1, kind: 'agentica-publication', owner: head.owner, epoch: head.epoch, sourceAttemptId: request.attemptId,
    sourceRequest: request, wireRevision: head.revision, observation: knowledge.checkpoint().knowledge,
    snapshot: { ...snapshot, roots: { world: null, knowledge: null } } };
  const pages: PerceptionPages = {
    get: knowledge.pages.get.bind(knowledge.pages), witness: knowledge.pages.witness.bind(knowledge.pages),
    async scan(area, prefix, after, limit = 4) {
      if (area !== 'knowledge') throw Error('Hidden world read'); stamp();
      const rows = [...knowledge.records.values()].filter(r => r.indexes.some(key => key.startsWith(prefix) && (!after || key > after)))
        .sort((a, b) => a.indexes[0].localeCompare(b.indexes[0]));
      return { rows: structuredClone(rows.slice(0, limit)), ...(rows.length > limit ? { next: rows[limit - 1].indexes[0] } : {}) };
    },
    async savedSnapshot() { return { record: { id: ref.id, key: ref.key, indexes: [], value: structuredClone(publication) } as unknown as CanonicalRecord,
      snapshot: structuredClone(publication.snapshot), source: structuredClone(request) }; },
    async sourceReceipt() { throw Error('Unexpected receipt read'); },
  };
  function republish() {
    stamp(); head.revision = Math.max(head.revision + 1, knowledge.checkpoint().knowledge!.sequence + 1); head.checkpoint = checkpointJson(knowledge.checkpoint());
    Object.assign(snapshot, snapshotOf(head)); request.expected = canonicalFence(head);
    publication.snapshot = { ...structuredClone(snapshot), roots: { world: null, knowledge: null } };
    publication.wireRevision = head.revision; publication.observation = knowledge.checkpoint().knowledge; ref.id += '-next';
  }
  return { knowledge, head, pages, snapshot, ref, publication, republish };
}
