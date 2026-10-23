import { CanonicalPages } from './pages';
import { accountHead, appendedBytes } from './accounting';
import { workBudget } from './budget';
import { emptyPrivateCapacity } from './privateCapacity';
import { PrivatePreparation, type PrivatePreparationSpec } from './privatePreparation';
import { fingerprint } from './validation';
import { DEFAULT_QUOTA, type CanonicalHead, type CanonicalIndexNode, type CanonicalReceipt, type CanonicalRecord,
  type CanonicalRequest, type CanonicalSnapshot, type CanonicalWrite, type Json } from './types';

export const specification = (): PrivatePreparationSpec => ({ id: 'floor-1', budgetBytes: 100_000,
  policy: { version: 'test-v1', recipe: { level: 1, seed: 42 }, scope: 'initialization-and-floor' } });
export const worldKey = (key: string) => key === 'dungeon/1' || key.startsWith('dungeon/1/');

export function preparationFixture() {
  const records = new Map<string, CanonicalRecord>(), nodes = new Map<string, CanonicalIndexNode>(), receipts = new Map<string, CanonicalReceipt>();
  const reads: { store: string; id: string }[] = [];
  const tx = { mode: 'readwrite', objectStore: (store: string) => ({ get: async (key: string[]) => {
    reads.push({ store, id: key[1] });
    const value = store === 'records' ? records.get(key[1]) : store === 'nodes' ? nodes.get(key[1]) : receipts.get(key[1]);
    return value === undefined ? undefined : structuredClone(value);
  } }) } as unknown as CanonicalWrite;
  const genesis: CanonicalHead = { schema: 1, generation: 'generation', gameId: 'game', owner: 'owner', epoch: 1, revision: 0,
    status: 'ready', checkpoint: {}, roots: { world: null, knowledge: null, execution: null }, allocations: {},
    quota: { ...DEFAULT_QUOTA, usedBytes: 0, reservedBytes: 0, reservations: 0, privateCapacity: emptyPrivateCapacity() } };
  let current = accountHead(undefined, genesis, 0), sequence = 0;
  function stage(head = current) {
    head = structuredClone(head);
    const source: CanonicalRequest = { attemptId: `attempt-${++sequence}`, operation: 'auto.command', input: { kind: 'tick' }, deadlineAt: null,
      expected: { generation: head.generation, gameId: head.gameId, owner: head.owner, epoch: head.epoch, revision: head.revision } };
    const budget = workBudget(), pages = new CanonicalPages(tx, structuredClone(head), budget), controller = new PrivatePreparation(head, pages, source);
    return { head, source, pages, controller, budget };
  }
  async function commit(work: ReturnType<typeof stage>, outcome: Json = { phase: 'generation' }) {
    work.controller.assertUsable(); const result = work.controller.decorate(outcome), staged = await work.pages.prepare();
    const receipt: CanonicalReceipt = { generation: work.head.generation, gameId: work.head.gameId, attemptId: work.source.attemptId,
      fingerprint: fingerprint(work.source), beforeRevision: work.head.revision, afterRevision: work.head.revision + 1,
      committedAt: '2026-10-23T00:00:00.000Z', result };
    const addedBytes = appendedBytes(staged.records, staged.nodes, receipt), capacity = work.controller.finish(addedBytes);
    work.controller.assertUsable();
    current = accountHead(work.head, { ...work.head, revision: receipt.afterRevision, roots: staged.roots,
      quota: { ...work.head.quota, privateCapacity: capacity } }, addedBytes);
    for (const row of staged.records) records.set(row.id, row);
    for (const row of staged.nodes) nodes.set(row.node.id, row);
    receipts.set(receipt.attemptId, receipt);
    return { head: structuredClone(current), receipt, staged, addedBytes, stats: work.budget.snapshot() };
  }
  async function established() {
    const first = stage(); await first.controller.begin(specification(), worldKey);
    await first.pages.set('world', 'dungeon/1', { phase: 'generation' });
    return commit(first);
  }
  const snapshot = (): CanonicalSnapshot => ({ generation: current.generation, gameId: current.gameId,
    revision: current.revision, roots: structuredClone(current.roots), checkpoint: structuredClone(current.checkpoint) });
  return { records, nodes, receipts, reads, stage, commit, established, snapshot, head: () => structuredClone(current) };
}
