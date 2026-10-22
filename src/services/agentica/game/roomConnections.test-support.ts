import { vi } from 'vitest';
import { chain, graphFixture, observe } from '../../../persistence/canonical/knowledge/graph.roomConnections.test-support';
import { canonicalFence, type CanonicalWork } from '../../../persistence/canonical/transaction';
import { snapshotOf } from '../../../persistence/canonical/read';
import type { CanonicalRecord, CanonicalRequest, Json, JsonObject } from '../../../persistence/canonical/types';
import { prepareAction } from '../../../persistence/canonical/agentica/validation';
import { retainPendingAction } from '../../../persistence/canonical/agentica/actions';
import { protocolAction } from '../../../persistence/canonical/agentica/types.test-support';
import type { ProtocolRead } from '../../../persistence/canonical/agentica/types';
import { canonicalJson } from '../sdk/agentica-host.mjs';
import { perceptionPublication } from './observation.test-support';

/** In-memory kernel receipt boundary; real protocol writers/readers and production earned graph. */
export async function connectionsFixture() {
  const memory = graphFixture(); await observe(memory, chain());
  const f = perceptionPublication(memory), records = new Map<string, CanonicalRecord>();
  const receipts = new Map<string, Awaited<ReturnType<ProtocolRead['sourceReceipt']>>>();
  const binding = { publication: structuredClone(f.ref), grant: { key: 'agentica/grants/current', id: 'grant' } };
  const get = vi.fn<CanonicalWork['pages']['get']>(async (area, key) => {
    if (area === 'execution') return structuredClone(records.get(key));
    if (area !== 'knowledge') throw Error('Forbidden domain read'); return f.pages.get(area, key);
  });
  const set = vi.fn<CanonicalWork['pages']['set']>(async (area, key, value, indexes = []) => {
    if (area !== 'execution') throw Error('Forbidden domain write');
    const row: CanonicalRecord = { generation: f.head.generation, gameId: f.head.gameId, area, key, value: structuredClone(value),
      indexes: [...indexes], revision: f.head.revision + 1, id: crypto.randomUUID() };
    records.set(key, row); return structuredClone(row);
  });
  const pages = { ...f.pages, get, set,
    sourceReceipt: async (id: string) => { const row = receipts.get(id); if (!row) throw Error('Missing receipt'); return structuredClone(row); },
  } as unknown as CanonicalWork['pages'];
  const tx = { head: f.head, pages, liveOperation: () => { throw Error('Forbidden operation'); } } as unknown as CanonicalWork;
  const request = (operation: string, input: Json): CanonicalRequest => ({ attemptId: crypto.randomUUID(), operation, input,
    expected: canonicalFence(f.head), deadlineAt: null });
  async function commit(req: CanonicalRequest, work: (tx: CanonicalWork) => Promise<JsonObject>) {
    const result = await work(tx), beforeRevision = f.head.revision++;
    receipts.set(req.attemptId, { source: structuredClone(req), receipt: { generation: f.head.generation, gameId: f.head.gameId,
      attemptId: req.attemptId, fingerprint: canonicalJson(req), beforeRevision, afterRevision: f.head.revision,
      committedAt: '2026-10-22T00:00:00.000Z', result: structuredClone(result) } });
    return result;
  }
  async function reserve(args: Record<string, unknown>) {
    const identity = await prepareAction({ ...protocolAction(f.publication.wireRevision), deadlineAt: '2099-01-01T00:00:00Z', arguments: args });
    const req = request('agentica.action.reserve', { action: identity.storageKey });
    await commit(req, async tx => (await retainPendingAction(tx, req, identity, f.ref, 'readOnly')).receipt);
    return identity;
  }
  return { ...f, memory, records, receipts, binding, pages, tx, get, set, request, commit, reserve, snapshot: () => snapshotOf(f.head) };
}
