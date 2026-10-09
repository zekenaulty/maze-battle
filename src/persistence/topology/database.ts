import { openDB, type DBSchema, type IDBPTransaction, type StoreKey, type StoreNames, type StoreValue } from 'idb';
import { TOPOLOGY_DATABASE, type TopologyRecords, type TopologyRoot } from './types';

// Future v2 checkpoint/knowledge/command stores belong HERE, not in another DB.
// Add stores to this schema and lock list with an additive version migration.
export interface TopologyDatabase extends DBSchema {
  roots: { key: string; value: TopologyRecords['roots'] };
  spaces: { key: [string, string]; value: TopologyRecords['spaces'] };
  sockets: { key: [string, number]; value: TopologyRecords['sockets'] };
  buckets: { key: [string, number, number]; value: TopologyRecords['buckets'] };
  receipts: { key: [string, string]; value: TopologyRecords['receipts'] };
}
export const TOPOLOGY_STORES = ['roots', 'spaces', 'sockets', 'buckets', 'receipts'] as const;
export const TOPOLOGY_DATABASE_VERSION = 1;
type Name = StoreNames<TopologyDatabase>;
type Key<N extends Name> = StoreKey<TopologyDatabase, N>;
type Value<N extends Name> = StoreValue<TopologyDatabase, N>;
type Transaction = IDBPTransaction<TopologyDatabase, typeof TOPOLOGY_STORES, 'readwrite'>;

/** Logical UTF-8 JSON bytes, including keys and store names, not engine disk overhead. */
export function recordBytes(store: string, key: unknown, value: unknown): number {
  return value === undefined ? 0 : new TextEncoder().encode(JSON.stringify([store, key, value])).byteLength;
}

/** Exact-key, single-record reads and staged writes only. No scans or world-sized copy. */
export class TopologyTransaction {
  private readonly tx: Transaction;
  private readonly cache = new Map<string, unknown>();
  private readonly writes = new Map<string, { store: Exclude<Name, 'roots'>; key: IDBValidKey; value: unknown }>();
  private byteDelta = 0;
  private writeSlot?: string;
  private pendingRoot?: { slot: string; value: TopologyRoot };
  constructor(tx: Transaction) { this.tx = tx; }

  private async cached<N extends Name>(store: N, key: Key<N>): Promise<Value<N> | undefined> {
    const id = JSON.stringify([store, key]);
    if (!this.cache.has(id)) {
      // get() conflates a missing key with stored undefined. Only [] means absent.
      const records = await this.tx.objectStore(store).getAll(key, 1);
      const value = records[0];
      if (records.length && (store === 'buckets' ? !Array.isArray(value)
        : value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)) {
        throw new Error(`Invalid stored topology ${store} record`);
      }
      this.cache.set(id, value);
    }
    return this.cache.get(id) as Value<N> | undefined;
  }

  async get<N extends Name>(store: N, key: Key<N>): Promise<Value<N> | undefined> {
    const value = store === 'roots' && key === this.pendingRoot?.slot ? this.pendingRoot.value : await this.cached(store, key);
    return structuredClone(value) as Value<N> | undefined;
  }

  async put<N extends Exclude<Name, 'roots'>>(store: N, key: Key<N>, value: Value<N> | undefined) {
    this.useSlot(key[0]);
    const snapshot = structuredClone(value);
    const previous = await this.get(store, key);
    this.byteDelta += recordBytes(store, key, snapshot) - recordBytes(store, key, previous);
    const id = JSON.stringify([store, key]);
    this.cache.set(id, snapshot);
    this.writes.set(id, { store, key, value: snapshot });
  }

  private useSlot(slot: string) {
    if (this.writeSlot !== undefined && this.writeSlot !== slot) throw new Error('One topology slot per transaction');
    this.writeSlot = slot;
  }

  private async account(slot: string, root: TopologyRoot) {
    const previous = await this.cached('roots', slot);
    const otherBytes = (previous?.serializedBytes ?? 0) - recordBytes('roots', slot, previous) + this.byteDelta;
    const next = { ...root, serializedBytes: 0 };
    // The total itself is serialized. Its decimal digit count reaches a fixed point.
    for (let attempt = 0; attempt < 16; attempt++) {
      const bytes = otherBytes + recordBytes('roots', slot, next);
      if (bytes === next.serializedBytes) break;
      next.serializedBytes = bytes;
    }
    if (!Number.isSafeInteger(next.serializedBytes) || next.serializedBytes < 0
      || next.serializedBytes !== otherBytes + recordBytes('roots', slot, next)) throw new Error('Invalid topology byte accounting');
    return next;
  }

  /** Stage the root, leaving the same transaction open for future gameplay stores. */
  async stageRoot(slot: string, root: TopologyRoot) {
    this.useSlot(slot);
    const value = await this.account(slot, structuredClone(root));
    this.pendingRoot = { slot, value };
    return value;
  }

  /** Called once by the outer transaction host, after ALL participating work. */
  async flush() {
    if (!this.pendingRoot) {
      if (this.writes.size) throw new Error('Topology writes require root byte accounting');
      return;
    }
    const { slot, value } = this.pendingRoot;
    Object.assign(value, await this.account(slot, value));
    if (value.serializedBytes > value.quotaBytes) throw new Error('Topology serialized-byte quota exceeded');
    for (const { store, key, value } of this.writes.values()) {
      // Store/key/value associations were checked by put; the staged union loses that relationship.
      const objectStore = this.tx.objectStore(store);
      if (value === undefined) await objectStore.delete(key as never);
      else await objectStore.put(value as never, key as never);
    }
    await this.tx.objectStore('roots').put(value, slot);
  }
}

export function openTopologyDatabase() {
  const db = openDB<TopologyDatabase>(TOPOLOGY_DATABASE, TOPOLOGY_DATABASE_VERSION, {
    upgrade(database) {
      for (const store of TOPOLOGY_STORES) if (!database.objectStoreNames.contains(store)) database.createObjectStore(store);
    },
    blocking() { void db.then(database => database.close()); },
  });
  return db;
}

/**
 * One composable v2 transaction. Callback results are provisional until this
 * resolves. Only await this transaction's IDB operations, never network/UI work.
 * Additive gameplay stores must join its lock scope, staged writes and byte quota.
 */
export async function topologyTransaction<T>(operation: (tx: TopologyTransaction) => Promise<T>): Promise<T> {
  const db = await openTopologyDatabase();
  try {
    // All host operations serialize against the same CAS lock, across tabs too.
    const tx = db.transaction(TOPOLOGY_STORES, 'readwrite', { durability: 'strict' });
    try {
      const staged = new TopologyTransaction(tx);
      const result = await operation(staged);
      await staged.flush();
      await tx.done;
      return result;
    } catch (error) {
      try { tx.abort(); } catch { /* Native request failure may already have aborted. */ }
      await tx.done.catch(() => undefined);
      throw error;
    }
  } finally { db.close(); }
}
