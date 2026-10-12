import { unwrap } from 'idb';
import type { AgenticaAction, AgenticaActionRecord, AgenticaResult } from '../../src/services/agentica/contracts';
import type { RpgAgenticaBinding } from '../../src/services/agentica/rpg/contracts';
import { actionFingerprint, actionKey } from '../../src/services/agentica/sdk/agentica-host.mjs';
import type { SaveControl } from '../../src/persistence/saveControl';
import type {} from './rpg-command-fixture';

// The parent persistence modules are intentionally runtime imports until its checkpoint lands.
interface RpgApi {
  ensureRpgScope(control: SaveControl): Promise<{ scopeId: string; gameId: string; floor: number; control: SaveControl }>;
  bindRpgRun(binding: RpgAgenticaBinding): Promise<unknown>;
  readRpgRun(runId: string): Promise<RpgAgenticaBinding | undefined>;
  saveRpgAction(key: string, record: AgenticaActionRecord): Promise<unknown>;
  loadRpgAction(key: string): Promise<AgenticaActionRecord | null>;
  executeRpgAction(action: AgenticaAction, settleOnly?: boolean): Promise<{ result: AgenticaResult; replayed: boolean; current?: unknown }>;
}
interface RpgHarness extends RpgApi {
  binding: RpgAgenticaBinding; actionKey: typeof actionKey; actionFingerprint: typeof actionFingerprint; snapshot: typeof snapshot;
  action(capabilityId?: string, args?: Record<string, unknown>, actionId?: string): AgenticaAction;
  reserve(action: AgenticaAction): Promise<unknown>;
  fault(action: AgenticaAction, store: string, method: 'put' | 'add', expire?: boolean): ReturnType<typeof fault>;
}

async function loadApi(): Promise<RpgApi> {
  const modules: Record<string, unknown> = {};
  for (const name of ['runs', 'records', 'actions']) {
    const path = `/src/persistence/rpgAgentica/${name}.ts`;
    Object.assign(modules, await import(/* @vite-ignore */ path));
  }
  for (const name of ['ensureRpgScope', 'bindRpgRun', 'readRpgRun', 'saveRpgAction', 'loadRpgAction', 'executeRpgAction']) {
    if (typeof modules[name] !== 'function') throw new Error(`Missing agreed RPG API: ${name}`);
  }
  return modules as unknown as RpgApi;
}

async function prepare() {
  for (let batch = 0; batch < 16; batch++) {
    const prepared = await window.rpgCommandTest.memory.prepareRpgMemory();
    if (prepared.status === 'ready') return;
    if (prepared.status !== 'partial') throw new Error('Fixture has no earned observation memory.');
  }
  throw new Error('Fixture memory exceeded its preparation bound.');
}

/** Native reads include all stores, so rollback tests also cover parent-owned operation/outbox writes. */
async function snapshot(includeActions = true): Promise<Record<string, unknown[]>> {
  const db = unwrap(await window.rpgCommandTest.repository.getDatabase());
  const names = [...db.objectStoreNames].filter(name => includeActions || name !== 'rpgAgenticaActions');
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, 'readonly'), values: Record<string, unknown[]> = {};
    tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve(values);
    for (const name of names) {
      const request = tx.objectStore(name).getAll();
      request.onsuccess = () => { values[name] = request.result; };
    }
  });
}

async function fault(api: RpgApi, action: AgenticaAction, store: string, method: 'put' | 'add', expire = false) {
  const original = IDBObjectStore.prototype[method], now = Date.now;
  let hits = 0, error = '';
  IDBObjectStore.prototype[method] = function(...args) {
    if (this.name !== store) return original.apply(this, args);
    hits++;
    if (!expire) throw new DOMException(`Injected ${store} ${method}`, 'QuotaExceededError');
    const request = original.apply(this, args);
    request.addEventListener('success', () => { Date.now = () => Date.parse(action.deadlineAt) + 1; }, { once: true });
    return request;
  };
  try { await api.executeRpgAction(action); } catch (failure) { error = String(failure); }
  finally { IDBObjectStore.prototype[method] = original; Date.now = now; }
  return { hits, error };
}

export async function install(control: SaveControl, large = false) {
  if (location.origin !== 'http://127.0.0.1:5204') throw new Error('Isolated RPG test origin only.');
  const h = window.rpgCommandTest;
  if (large) {
    const owned = await h.custody.updateOwnedGame(control, game => ({ ...game,
      maze: { ...h.lineMaze(60, [
        ...Array.from({ length: 33 }, (_, column) => h.roomAt(`known-${column}`, 'junction', column)),
        h.roomAt('wire-secret-room', 'boss', 59),
      ], 16), visibility: { radius: 16, explored: Array.from({ length: 60 }, (_, column) => ({ row: 0, column })) } },
      chests: [...game.chests, { id: 'wire-secret-chest', level: 1, position: { row: 0, column: 59 }, opened: false }],
    }));
    control = owned.control;
  }
  await prepare();
  const api = await loadApi(), scope = await api.ensureRpgScope(control);
  const binding: RpgAgenticaBinding = { protocolVersion: 1, hostId: 'maze-battle', sessionId: scope.scopeId,
    sessionEpoch: String(scope.control.epoch), scopeId: scope.scopeId, perspectiveId: 'party',
    gameId: scope.gameId, floor: scope.floor, objectiveId: 'reach-known-exit', objective: 'Reach the remembered exit',
    runId: 'rpg-native-run', manifestHash: `sha256:${'a'.repeat(64)}`, control: scope.control,
    completionTarget: { floor: scope.floor, row: 0, column: 5 }, travelLimits: { steps: 64, replans: 4, durationMs: 120000 } };
  await api.bindRpgRun(binding);
  await connect(binding);
  return binding;
}

/** Reload the public test handle without rebinding or adopting an old run. */
export async function connect(binding: RpgAgenticaBinding) {
  const api = await loadApi();
  const harness = { ...api, binding, actionKey, actionFingerprint, snapshot,
    action(capabilityId = 'maze.navigate', args: Record<string, unknown> = { row: 0, column: 5 }, actionId = 'original'): AgenticaAction {
      return { actionId, runId: binding.runId, runnerRunId: 'native-runner', stepId: `step-${actionId}`,
        sessionId: binding.sessionId, sessionEpoch: binding.sessionEpoch, capabilityId, manifestHash: binding.manifestHash,
        arguments: args, expectedRevision: binding.control.revision, deadlineAt: new Date(Date.now() + 120000).toISOString() };
    },
    reserve: (action: AgenticaAction) => api.saveRpgAction(actionKey(action), { fingerprint: actionFingerprint(action), status: 'pending' }),
    fault: (action: AgenticaAction, store: string, method: 'put' | 'add', expire = false) => fault(api, action, store, method, expire),
  };
  window.rpgAgenticaActionsTest = harness;
  return binding;
}

export async function createV6Save() {
  const game = window.rpgCommandTest.game(), control = { owner: 'v6-owner', epoch: 7, revision: 19 };
  const slot = { slotId: 'auto', label: 'Preserve exact v6 save', kind: 'auto',
    createdAt: game.createdAt, updatedAt: game.updatedAt, game };
  const old = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('maze-battle', 6);
    request.onupgradeneeded = () => {
      const db = request.result, saves = db.createObjectStore('saves', { keyPath: 'slotId' });
      saves.createIndex('byKind', 'kind'); saves.createIndex('byUpdatedAt', 'updatedAt');
      db.createObjectStore('meta', { keyPath: 'key' });
      db.createObjectStore('telemetry', { keyPath: 'gameId' }).createIndex('byUpdatedAt', 'updatedAt');
      db.createObjectStore('gameCommands', { keyPath: 'attemptId' }).createIndex('byGameId', 'gameId');
      db.createObjectStore('observations', { keyPath: 'id' }).createIndex('byGameId', 'gameId');
      for (const name of ['rpgMemoryNodes', 'rpgMemoryHeads', 'rpgTravels']) db.createObjectStore(name, { keyPath: 'id' });
      db.createObjectStore('rpgTravelActions', { keyPath: 'attemptId' });
    };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Unexpected open database during v6 fixture creation.'));
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = old.transaction(['saves', 'meta'], 'readwrite');
      tx.objectStore('saves').put(slot);
      tx.objectStore('meta').put({ key: 'control:auto', value: JSON.stringify(control) });
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error);
    });
  } finally { old.close(); }
  const db = await window.rpgCommandTest.repository.getDatabase();
  return { slot, control, stored: await db.get('saves', 'auto'), current: await window.rpgCommandTest.custody.readGameControl(),
    version: db.version, stores: [...db.objectStoreNames], state: await snapshot() };
}

declare global { interface Window { rpgAgenticaActionsTest: RpgHarness } }
