import { deleteDB, openDB } from 'idb';
import * as api from '../../src/persistence/streamRepository';
import * as durable from '../../src/persistence/directedStreamRepository';
import { TOPOLOGY_DATABASE } from '../../src/persistence/topology/types';
import { TOPOLOGY_STORES, recordBytes } from '../../src/persistence/topology/database';
import { StreamPlanner } from '../../src/domain/expedition/streaming/planner';
import { opposite } from '../../src/domain/maze/movement';
import type { Direction } from '../../src/domain/types';
import type { StreamCommand } from '../../src/domain/expedition/streaming/types';
import type { StreamDestination } from '../../src/domain/expedition/streaming/directed/types';
import { DirectedStreamExecutor } from '../../src/services/expedition/directed/executor';
import { loadDirectedStreamKnowledge } from '../../src/services/expedition/directed/knowledge';

let executor: DirectedStreamExecutor | undefined;
const harness = {
  api, durable, openDB, TOPOLOGY_DATABASE, TOPOLOGY_STORES,
  get executor() { if (!executor) throw new Error('Executor is not open'); return executor; },
  async open(slot = 'directed') { executor = await DirectedStreamExecutor.open(slot); return executor.record; },
  async setup(slot = 'directed') {
    const snapshot = await api.createStreamSlot(slot, { version: 'spaces-v2', worldId: slot, floorId: 'floor', seed: 55, level: 1 });
    const control = await api.claimStreamControl(slot, 'prelude', null);
    const cell = Object.values(snapshot.room.knowledge!.cells).find(cell => cell.row === 4 && cell.column === 2)!;
    if (!cell) throw new Error('Missing observed local fixture destination');
    return { snapshot, control, target: { kind: 'cell', address: { spaceId: cell.spaceId, row: cell.row, column: cell.column }, arrival: 'occupy' } as StreamDestination };
  },
  async act(command: StreamCommand, slot = 'directed') {
    const { checkpoint } = await api.loadStreamSnapshot(slot);
    const control = (await api.loadStreamControl(slot))!;
    const result = await api.executeStreamAction(slot, { version: 2, actionId: crypto.randomUUID(), ...control,
      expectedRevision: checkpoint.revision, expectedTopologyRevision: checkpoint.topologyRevision, command });
    if (result.disposition !== 'applied') throw new Error(result.reason);
    return api.loadStreamSnapshot(slot);
  },
  async setupThree() {
    let { snapshot } = await harness.setup();
    const explorer = new StreamPlanner(), rooms: string[] = [], reverse: Direction[] = [];
    let target: StreamDestination | undefined;
    for (let i = 0; i < 4000; i++) {
      const page = snapshot.room.knowledge!;
      if (snapshot.room.space.spec.kind === 'room' && !rooms.includes(page.spaceId)) rooms.push(page.spaceId);
      const chest = Object.values(page.chests).find(chest => !chest.opened);
      if (rooms.length === 3 && rooms[2] === page.spaceId && chest) {
        target = { kind: 'chest', chestId: chest.id, address: { spaceId: chest.spaceId, row: chest.row, column: chest.column }, arrival: 'occupy' };
        break;
      }
      const decision = explorer.choose(snapshot.checkpoint, page, (await api.loadStreamControl('directed'))!);
      if (!decision.command) throw new Error(decision.reason);
      snapshot = await harness.act(decision.command);
      if (decision.command.type === 'move') reverse.push(opposite(decision.command.direction));
    }
    if (!target || rooms.length !== 3) throw new Error('Three-room observation prelude failed');
    for (const direction of reverse.reverse()) snapshot = await harness.act({ type: 'move', direction });
    const frame = { checkpoint: snapshot.checkpoint, control: (await api.loadStreamControl('directed'))! };
    const read = (id: string) => api.readStreamKnowledge('directed', id);
    const fromHome = await loadDirectedStreamKnowledge(frame, target, read);
    if (fromHome.plan.status !== 'ready') throw new Error(fromHome.plan.reason);
    const traversed = new Set([frame.checkpoint.position.spaceId, ...fromHome.plan.route.map(cell => cell.spaceId)].filter(id => rooms.includes(id)));
    if (traversed.size < 3) {
      const second = (await read(rooms[1]))!;
      const chest = Object.values(second.chests)[0];
      const address = { spaceId: chest.spaceId, row: chest.row, column: chest.column };
      const route = await loadDirectedStreamKnowledge(frame, { kind: 'cell', address, arrival: 'occupy' }, read);
      if (route.plan.status !== 'ready') throw new Error(route.plan.reason);
      for (const next of route.plan.route) snapshot = await harness.act({ type: 'move', direction: route.knowledge.direction(snapshot.checkpoint.position, next)! });
    }
    await harness.open();
    return { target, rooms, checkpoint: snapshot.checkpoint };
  },
  async pending() {
    const record = harness.executor.record!;
    return durable.prepareDurableDirectedStreamMove('directed', harness.executor.control,
      { operationId: record.state.operation.id, revision: record.revision, actionId: crypto.randomUUID() });
  },
  async raw() {
    const db = await openDB(TOPOLOGY_DATABASE);
    try {
      const tx = db.transaction(db.objectStoreNames, 'readonly');
      const records: { store: string; key: IDBValidKey; value: any }[] = [];
      for (const name of db.objectStoreNames) {
        for (const key of await tx.objectStore(name).getAllKeys()) records.push({ store: name, key, value: await tx.objectStore(name).get(key) });
      }
      await tx.done;
      return { version: db.version, records, bytes: records.reduce((sum, row) => sum + recordBytes(row.store, row.key, row.value), 0) };
    } finally { db.close(); }
  },
  async downgradeFixtureToV3() {
    const before = await harness.raw();
    await deleteDB(TOPOLOGY_DATABASE);
    const stores = TOPOLOGY_STORES.filter(name => !name.startsWith('directedStream'));
    const db = await openDB(TOPOLOGY_DATABASE, 3, { upgrade(db) { for (const name of stores) db.createObjectStore(name); } });
    const tx = db.transaction(stores, 'readwrite');
    for (const row of before.records) if (stores.includes(row.store as never)) await tx.objectStore(row.store).put(row.value, row.key);
    await tx.done; db.close();
    return before.records;
  },
  async trace<T>(action: () => Promise<T>) {
    const prototype = IDBObjectStore.prototype, getAll = prototype.getAll;
    const scans = ['getAllKeys', 'openCursor', 'openKeyCursor', 'count'] as const;
    const originals = scans.map(name => prototype[name]);
    const reads: Record<string, number> = {};
    prototype.getAll = function (key, count) {
      if (key === undefined || key === null || key instanceof IDBKeyRange || count !== 1) throw new Error('Non-point read in directed host');
      reads[this.name] = (reads[this.name] ?? 0) + 1;
      return getAll.call(this, key, count);
    };
    for (const name of scans) prototype[name] = (() => { throw new Error('World scan in directed host'); }) as never;
    try { return { result: await action(), reads }; }
    finally { prototype.getAll = getAll; scans.forEach((name, index) => { prototype[name] = originals[index] as never; }); }
  },
};
declare global { interface Window { directedStream: typeof harness } }
window.directedStream = harness;
