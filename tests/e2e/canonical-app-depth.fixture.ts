import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { executeCanonical } from '../../src/persistence/canonical/transaction';
import { checkpointJson, gameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';
import { executeExplorationCommand } from '../../src/persistence/canonical/game/explorationCommand';
import { prepareGameFloor } from '../../src/persistence/canonical/game/preparation';
import { loadFloor, loadWorld } from '../../src/persistence/canonical/world/records';
import { recordGameObservation } from '../../src/persistence/canonical/knowledge/write';
import type { WorldPosition } from '../../src/persistence/canonical/world/types';
import { gameRequest } from '../../src/services/game/canonicalRequests';
import { storageProbe } from './storage-probe';

async function place(at: WorldPosition) {
  const { head } = await readCanonicalHead();
  await executeCanonical(gameRequest(head, 'fixture.depth-position', {}), async tx => {
    const c = await recordGameObservation(tx, { ...gameCheckpoint(tx.head.checkpoint), position: at, mode: 'manual' });
    tx.setCheckpoint(checkpointJson(c)); return {};
  });
}

/** Fixture setup only: bypass walking to stairs, not generation/content rules. The App is unmounted. */
export async function retainFloors(count: number) {
  const before = await readCanonical(async p => ({ world: await loadWorld(p), first: await loadFloor(p, 1) }));
  for (let level = before.value.world.deepestLevel + 1; level <= count; level++) {
    const previous = (await readCanonical(p => loadFloor(p, level - 1))).value;
    if (!previous.exit) throw Error('Fixture requires a completed previous floor');
    await place({ level: level - 1, cell: previous.exit });
    let ready = false;
    for (let batch = 0; batch < 512; batch++) {
      const { head } = await readCanonicalHead();
      const result = await prepareGameFloor(gameRequest(head, 'game.prepare', { level }));
      if ((result.receipt.result as { phase: string }).phase === 'ready') { ready = true; break; }
    }
    if (!ready) throw Error('Floor preparation exhausted its fixture bound');
    const { head } = await readCanonicalHead();
    await executeExplorationCommand(gameRequest(head, 'exploration.command', { kind: 'stairs', direction: 'down' }));
  }
  // Use one common open-room position, off the entrance so alternating keys cannot trigger town.
  const cell = { ...before.value.first.entry, row: before.value.first.entry.row + 1 };
  await place({ level: 1, cell });
  return (await readCanonical(p => loadWorld(p))).value.deepestLevel;
}

let active: { finish: () => ReturnType<ReturnType<typeof storageProbe>['finish']>; started: number;
  readKeys: string[]; writeKeys: string[]; restore: (() => void)[]; usage?: number } | undefined;
export async function startProbe() {
  if (active) throw Error('Probe already active');
  const usage = (await navigator.storage.estimate()).usage, readKeys: string[] = [], writeKeys: string[] = [], restore: (() => void)[] = [];
  for (const method of ['get', 'add', 'put'] as const) {
    const original = IDBObjectStore.prototype[method];
    Object.defineProperty(IDBObjectStore.prototype, method, { configurable: true, writable: true, value: function(this: IDBObjectStore, ...args: unknown[]) {
      const request = Reflect.apply(original, this, args) as IDBRequest;
      if (this.transaction.db.name === 'maze-battle' && this.name === 'records') {
        if (method === 'get') request.addEventListener('success', () => { if (request.result) readKeys.push(request.result.key); }, { once: true });
        else writeKeys.push((args[0] as { key: string }).key);
      }
      return request;
    } });
    restore.push(() => Object.defineProperty(IDBObjectStore.prototype, method, { configurable: true, writable: true, value: original }));
  }
  const meter = storageProbe(); active = { finish: meter.finish, started: performance.now(), readKeys, writeKeys, restore, usage };
}
export async function finishProbe() {
  if (!active) throw Error('No active probe');
  const current = active; active = undefined;
  const native = current.finish(), elapsedMs = performance.now() - current.started;
  for (const restore of current.restore.reverse()) restore();
  const writes = native.operations.filter(o => ['add', 'put', 'delete', 'clear'].includes(o.method));
  const reads = native.operations.filter(o => !writes.includes(o));
  return { elapsedMs, usageBefore: current.usage, usageAfter: (await navigator.storage.estimate()).usage,
    reads: reads.length, writes: writes.length, readBytes: reads.reduce((n, o) => n + o.logicalBytes, 0),
    writeBytes: writes.reduce((n, o) => n + o.logicalBytes, 0), readKeys: current.readKeys, writeKeys: current.writeKeys, native };
}
