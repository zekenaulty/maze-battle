import { vi } from 'vitest';
import { canonicalJson } from '../sdk/agentica-host.mjs';
import { canonicalFence } from '../../../persistence/canonical/transaction';
import { snapshotOf } from '../../../persistence/canonical/read';
import type { CanonicalReceipt, CanonicalRecord, CanonicalRequest, JsonObject } from '../../../persistence/canonical/types';
import type { ActionResult, PreparedAction, ProtocolRef, ProtocolSource } from '../../../persistence/canonical/agentica/types';
import { actionResultWrite } from '../../../persistence/canonical/agentica/actions.result';
import { protocolAction } from '../../../persistence/canonical/agentica/types.test-support';
import { prepareAction } from '../../../persistence/canonical/agentica/validation';
import type { QuestQueryArgs } from '../../../persistence/canonical/agentica/quest.proof';
import { addQuest, questMemory } from '../../../persistence/canonical/content/acceptedQueries.test-support';
import { actionResult } from './actionContract';
import { perceptionFixture } from './observation.test-support';
import { queryQuests } from './questContext';

export async function questContextFixture(count = 6) {
  const f = await perceptionFixture(), memory = questMemory();
  for (let i = 0; i < count; i++) await addQuest(memory, `private-target-${i}`);
  const execution = new Map<string, CanonicalRecord>(), receipts = new Map<string, {
    source: CanonicalRequest; receipt: CanonicalReceipt;
  }>();
  const binding = { publication: f.ref, grant: { key: 'agentica/launch/grant', id: 'grant' } };
  const append = (key: string, value: ProtocolSource) => {
    const id = crypto.randomUUID(), revision = ++f.head.revision;
    const row: CanonicalRecord = { generation: f.head.generation, gameId: f.head.gameId, id, key, area: 'execution',
      indexes: [], revision, value: structuredClone(value) as unknown as JsonObject };
    execution.set(key, row);
    receipts.set(value.sourceAttemptId, { source: value.sourceRequest, receipt: { generation: f.head.generation, gameId: f.head.gameId,
      attemptId: value.sourceAttemptId, fingerprint: canonicalJson(value.sourceRequest), beforeRevision: revision - 1, afterRevision: revision,
      committedAt: '2026-10-20T01:00:00.000Z', result: { recordId: id, recordWitness: canonicalJson(row), reference: { key, id } } } });
    return { key, id };
  };
  const pages = {
    ...f.pages,
    get: vi.fn(async (area, key) => area === 'world' ? memory.pages.get(area, key)
      : area === 'execution' ? structuredClone(execution.get(key)) : f.pages.get(area, key)),
    scan: vi.fn(async (area, prefix, after, limit) => area === 'world' ? memory.pages.scan(area, prefix, after, limit)
      : f.pages.scan(area, prefix, after, limit)),
    async sourceReceipt(attempt: string) {
      if (attempt === f.publication.sourceAttemptId) return { source: f.publication.sourceRequest, receipt: {
        generation: f.head.generation, gameId: f.head.gameId, attemptId: attempt, fingerprint: canonicalJson(f.publication.sourceRequest),
        beforeRevision: f.publication.wireRevision,
        afterRevision: f.publication.wireRevision + 1, committedAt: '2026-10-20T00:59:00.000Z', result: {} } };
      const value = receipts.get(attempt); if (!value) throw Error('Missing source receipt'); return structuredClone(value);
    },
  } as Parameters<typeof queryQuests>[0];
  const request = (operation: string, input: JsonObject): CanonicalRequest => ({
    attemptId: crypto.randomUUID(), operation, input, expected: canonicalFence(f.head), deadlineAt: null,
  });
  async function reserve(args: QuestQueryArgs) {
    const identity = await prepareAction({ ...protocolAction(f.publication.wireRevision), actionId: crypto.randomUUID(),
      stepId: crypto.randomUUID(), arguments: args });
    const sourceRequest = request('agentica.action.reserve', { action: identity.storageKey, ...binding } as unknown as JsonObject);
    const ref = append(identity.storageKey, { schema: 1, kind: 'agentica-action', sourceAttemptId: sourceRequest.attemptId, sourceRequest,
      owner: f.head.owner, epoch: f.head.epoch, key: identity.key, fingerprint: identity.fingerprint, action: identity.action,
      publication: f.ref, effect: 'readOnly' } as ProtocolSource);
    return { identity, ref };
  }
  async function query(args: QuestQueryArgs) {
    const { identity, ref } = await reserve(args);
    const observed = await queryQuests(pages, snapshotOf(f.head), binding, identity, args);
    const result = actionResult(identity, observed.observation, 'Accepted journal query.');
    const write = await actionResultWrite(pages, f.head, request('agentica.action.resolve', { action: identity.storageKey }),
      identity, result, 'standalone', observed.query);
    if ('existing' in write) throw Error('Unexpected existing query');
    const resultRef = append(write.key, write.value);
    return { identity, ref, result, resultRef, source: write.value, ...observed };
  }
  const read = (identity: PreparedAction, ref: ProtocolRef) => import('../../../persistence/canonical/agentica/actions.result')
    .then(({ readActionResultSource }) => readActionResultSource(pages, identity, ref));
  function rewrite(row: CanonicalRecord) {
    const value = row.value as unknown as ActionResult;
    (receipts.get(value.sourceAttemptId)!.receipt.result as JsonObject).recordWitness = canonicalJson(row);
  }
  return { ...f, pages, binding, memory, execution, receipts, request, reserve, query, read, rewrite };
}
