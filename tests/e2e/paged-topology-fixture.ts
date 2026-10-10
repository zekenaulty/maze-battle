import { openDB } from 'idb';
import * as api from '../../src/persistence/topologyRepository';
import { recordBytes } from '../../src/persistence/topology/database';
import { durableFixture } from '../../src/persistence/expeditionAction.testSupport';
import { expandTopology } from '../../src/domain/expedition/topology/generation';
import { MemoryTopology } from '../../src/domain/expedition/topology/memoryTopology';
import { materializeTopologySpace, resolvedSpaceSpec } from '../../src/domain/expedition/topology/projection';
import type { TopologyRecipe } from '../../src/domain/expedition/topology/types';

const recipe: TopologyRecipe = { version: 'spaces-v2', worldId: 'paged-world', floorId: 'deep-floor', level: 80, seed: 0 };
const harness = {
  api, openDB, recipe, expandTopology, MemoryTopology, materializeTopologySpace, resolvedSpaceSpec, legacyRecord: durableFixture,
  async setup(slot = 'floor', quotaBytes?: number) { return api.createTopologySlot(slot, recipe, quotaBytes); },
  async next(requestId: string, slot = 'floor') {
    const root = (await api.loadTopologyHeader(slot))!;
    return api.expandTopologyNext(slot, { scopeId: root.header.scopeId, expectedRevision: root.header.revision, requestId });
  },
  // Whole-store inspection is TEST ONLY, outside measured host operations.
  async snapshot() {
    const db = await openDB(api.TOPOLOGY_DATABASE);
    try {
      const tx = db.transaction(db.objectStoreNames, 'readonly');
      const records: { store: string; key: IDBValidKey; value: any }[] = [];
      for (const store of db.objectStoreNames) {
        for (const key of await tx.objectStore(store).getAllKeys()) records.push({ store, key, value: await tx.objectStore(store).get(key) });
      }
      await tx.done;
      return { records, bytes: records.reduce((total, entry) => total + recordBytes(entry.store, entry.key, entry.value), 0) };
    } finally { db.close(); }
  },
  async trace<T>(action: () => Promise<T>) {
    const reads: Record<string, number> = {};
    const methods: Record<string, number> = {};
    const prototype = IDBObjectStore.prototype;
    const get = prototype.get, getAll = prototype.getAll;
    const scans = ['getAllKeys', 'getKey', 'openCursor', 'openKeyCursor', 'count'] as const;
    const originals = scans.map(name => prototype[name]);
    const read = (store: string, method: string) => {
      reads[store] = (reads[store] ?? 0) + 1; methods[method] = (methods[method] ?? 0) + 1;
    };
    prototype.get = function (key) { read(this.name, 'get'); return get.call(this, key); };
    prototype.getAll = function (key, count) {
      if (key === undefined || key === null || key instanceof IDBKeyRange || count !== 1) throw new Error('Unbounded host read: getAll');
      indexedDB.cmp(key, key); // Reject options objects or other non-key arguments.
      read(this.name, 'getAll'); return getAll.call(this, key, count);
    };
    for (const name of scans) prototype[name] = (() => { throw new Error(`Unbounded host read: ${name}`); }) as never;
    try { return { result: await action(), reads, methods, total: Object.values(reads).reduce((a, b) => a + b, 0) }; }
    finally { prototype.get = get; prototype.getAll = getAll; scans.forEach((name, index) => { prototype[name] = originals[index] as never; }); }
  },
};
declare global { interface Window { paged: typeof harness } }
window.paged = harness;
