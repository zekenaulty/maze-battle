import { MemoryTree } from '../rpgMemory/tree';
import { validateNode } from '../rpgMemory/treeTypes';
import { canonicalJson } from '../../services/agentica/sdk/agentica-host.mjs';
import { validateReceipt } from './receipts';
import type { WorkBudget } from './budget';
import type { CanonicalGameSnapshot, CanonicalHead, CanonicalIndexNode, CanonicalRecord, CanonicalWrite, CanonicalRead, Json, RecordArea } from './types';
import { check, identity, isArea, isObject, jsonBytes, record, recordKey, snapshot as validateSnapshot, validId } from './validation';

/** Immutable records plus snapshot-specific indexes; no historical world is hydrated. */
export class CanonicalPages {
  private readonly trees = new Map<RecordArea, MemoryTree>();
  private readonly records = new Map<string, CanonicalRecord>();
  private readonly nodes = new Map<string, CanonicalIndexNode>();
  // Immutable IDs are stable inside this transaction. Retention is bounded by the read/byte budget.
  private readonly readNodes = new Map<string, CanonicalIndexNode>();
  private readonly readRecords = new Map<string, CanonicalRecord>();
  private busy = false;
  private failed = false;
  private prepared = false;
  private restored?: CanonicalGameSnapshot;
  private readonly tx: CanonicalWrite | CanonicalRead;
  private readonly head: CanonicalHead;
  private readonly budget: WorkBudget;
  constructor(tx: CanonicalWrite | CanonicalRead, head: CanonicalHead, budget: WorkBudget) {
    this.tx = tx; this.head = head; this.budget = budget;
  }

  private async operation<T>(work: () => Promise<T>): Promise<T> {
    try {
      check(!this.busy && !this.failed && !this.prepared, 'record transaction is not usable');
      this.busy = true; this.budget.alive();
      return await work();
    } catch (error) { this.failed = true; throw error; }
    finally { this.busy = false; }
  }

  private tree(area: RecordArea) {
    check(isArea(area), 'invalid record area');
    check(!this.restored || area === 'execution', 'restored areas cannot be mixed with record work');
    let tree = this.trees.get(area);
    if (!tree) {
      tree = new MemoryTree({
        get: async id => {
          let row = this.readNodes.get(id);
          if (!row) {
            this.budget.read();
            row = await this.tx.objectStore('nodes').get([this.head.gameId, id]);
            this.budget.received(row === undefined ? 0 : jsonBytes(row));
          }
          check(row, 'missing index node'); identity(row, this.head);
          const node = validateNode(row.node, id); this.readNodes.set(id, row); return node;
        },
        add: async node => {
          validateNode(node, node.id);
          check(validId(node.id) && !this.nodes.has(node.id), 'duplicate index node');
          const row = { generation: this.head.generation, gameId: this.head.gameId, node };
          this.budget.write(jsonBytes(row)); this.nodes.set(node.id, row);
        },
      }, this.head.roots[area], { read: () => this.budget.alive(), write: () => this.budget.alive() });
      this.trees.set(area, tree);
    }
    return tree;
  }

  private async dereference(area: RecordArea, key: string, reference: unknown) {
    check(typeof reference === 'string' && validId(reference), 'invalid record pointer');
    let row = this.records.get(reference) ?? this.readRecords.get(reference);
    if (!row) {
      this.budget.read();
      row = await this.tx.objectStore('records').get([this.head.gameId, reference]);
      this.budget.received(row === undefined ? 0 : jsonBytes(row));
    }
    record(row, reference, this.head, area, key);
    check(row.revision <= this.head.revision + (this.records.has(reference) ? 1 : 0), 'future record revision');
    if (!this.records.has(reference)) this.readRecords.set(reference, row);
    return structuredClone(row);
  }

  private async lookup(area: RecordArea, key: string) {
    recordKey(key);
    const path = `record/${key}`, ref = await this.tree(area).get(path);
    return ref === undefined ? undefined : this.dereference(area, path, ref);
  }

  get(area: RecordArea, key: string) { return this.operation(() => this.lookup(area, key)); }

  /** Bounded immutable provenance read, at the same roots/revision as record work. */
  sourceReceipt(attemptId: string) {
    return this.operation(async () => {
      check(validId(attemptId), 'invalid source attempt'); this.budget.read();
      const receipt = await this.tx.objectStore('receipts').get([this.head.gameId, attemptId]);
      this.budget.received(receipt === undefined ? 0 : jsonBytes(receipt));
      const source = validateReceipt(receipt, this.head);
      check(receipt!.attemptId === attemptId && receipt!.afterRevision <= this.head.revision, 'source receipt identity or revision changed');
      return { receipt: structuredClone(receipt!), source };
    });
  }

  /** Resolve retained authority through the live execution root and its exact creation receipt. */
  private async snapshotAt(key: string) {
    const row = await this.lookup('execution', key);
    check(row && isObject(row.value) && validId(row.value.sourceAttemptId) && isObject(row.value.snapshot), 'missing stored snapshot');
    const snapshot = row.value.snapshot as unknown as CanonicalGameSnapshot;
    check(isObject(snapshot.roots) && Object.keys(snapshot.roots).sort().join(',') === 'knowledge,world', 'invalid saved roots');
    validateSnapshot({ ...snapshot, roots: { ...snapshot.roots, execution: null } }, this.head);
    this.budget.read();
    const receipt = await this.tx.objectStore('receipts').get([this.head.gameId, row.value.sourceAttemptId]);
    this.budget.received(receipt === undefined ? 0 : jsonBytes(receipt));
    const source = validateReceipt(receipt, this.head);
    check(receipt!.attemptId === row.value.sourceAttemptId && receipt!.afterRevision === row.revision
      && receipt!.beforeRevision === snapshot.revision && row.revision <= this.head.revision
      && isObject(receipt!.result) && receipt!.result.snapshotRecordId === row.id
      && receipt!.result.snapshotWitness === canonicalJson(row), 'stored snapshot source changed');
    for (const root of Object.values(snapshot.roots)) if (root !== null) {
      this.budget.read();
      const node = await this.tx.objectStore('nodes').get([this.head.gameId, root]);
      this.budget.received(node === undefined ? 0 : jsonBytes(node));
      check(node, 'missing snapshot root'); identity(node, this.head); validateNode(node.node, root);
    }
    return { record: row, snapshot: structuredClone(snapshot), source };
  }

  savedSnapshot(key: string) { return this.operation(() => this.snapshotAt(key)); }

  /** Keys, never caller-supplied roots. Execution/custody/accounting are deliberately not restored. */
  restoreSnapshot(key: string) {
    return this.operation(async () => {
      check(this.tx.mode === 'readwrite', 'read-only record view');
      check(!this.restored && !this.trees.has('world') && !this.trees.has('knowledge'), 'snapshot restore must be isolated');
      check(this.head.quota.reservations === 0 && this.head.quota.reservedBytes === 0
        && Object.keys(this.head.allocations).length === 0, 'snapshot restore requires no live allocations');
      this.restored = (await this.snapshotAt(key)).snapshot;
    });
  }

  /** Primary-record namespace identity, independent of secondary indexes. */
  witness(area: RecordArea, prefix: string) {
    return this.operation(() => {
      recordKey(prefix);
      return this.tree(area).witness(`record/${prefix}`);
    });
  }

  async set(area: RecordArea, key: string, value: Json, indexes: string[] = []) {
    return this.operation(async () => {
      check(this.tx.mode === 'readwrite', 'read-only record view');
      recordKey(key); jsonBytes(value);
      check(Array.isArray(indexes) && indexes.length <= 8 && new Set(indexes).size === indexes.length, 'invalid indexes');
      indexes.forEach(recordKey);
      const row: CanonicalRecord = { generation: this.head.generation, gameId: this.head.gameId, id: crypto.randomUUID(),
        area, key, value: structuredClone(value), indexes: [...indexes], revision: this.head.revision + 1 };
      const bytes = jsonBytes(row), tree = this.tree(area), previous = await this.lookup(area, key);
      if (previous) for (const index of previous.indexes) await tree.delete(`index/${index}`);
      for (const index of row.indexes) {
        const occupied = await tree.get(`index/${index}`);
        check(occupied === undefined, 'index key already assigned');
        await tree.set(`index/${index}`, row.id);
      }
      this.budget.write(bytes); this.records.set(row.id, row);
      await tree.set(`record/${key}`, row.id);
      if (previous) this.records.delete(previous.id);
      return structuredClone(row);
    });
  }

  async delete(area: RecordArea, key: string) {
    return this.operation(async () => {
      check(this.tx.mode === 'readwrite', 'read-only record view');
      const previous = await this.lookup(area, key);
      if (!previous) return;
      const tree = this.tree(area);
      for (const index of previous.indexes) await tree.delete(`index/${index}`);
      await tree.delete(`record/${key}`);
      this.records.delete(previous.id);
    });
  }

  async scan(area: RecordArea, prefix: string, after?: string, limit = 16) {
    return this.operation(async () => {
      recordKey(prefix); if (after !== undefined) recordKey(after);
      check(after === undefined || after.startsWith(prefix), 'cursor is outside prefix');
      const page = await this.tree(area).scan(`index/${prefix}`, after === undefined ? undefined : `index/${after}`, limit);
      const rows = [];
      for (const entry of page.entries) {
        const row = await this.dereference(area, entry.key, entry.value);
        check(await this.tree(area).get(`record/${row.key}`) === row.id, 'index references a superseded record');
        rows.push(row);
      }
      return { rows, ...(page.next === undefined ? {} : { next: page.next.slice(6) }) };
    });
  }

  /** Stages new root paths only; existing nodes/records are never rewritten. */
  async prepare() {
    return this.operation(async () => {
      const roots = { ...this.head.roots, ...this.restored?.roots };
      for (const [area, tree] of this.trees) roots[area] = await tree.flush();
      this.prepared = true;
      return { roots, records: [...this.records.values()], nodes: [...this.nodes.values()], snapshot: this.restored };
    });
  }

  finishRead() {
    check(this.tx.mode === 'readonly' && !this.failed && !this.busy && !this.prepared, 'read view is not usable');
    this.prepared = true;
  }
}
