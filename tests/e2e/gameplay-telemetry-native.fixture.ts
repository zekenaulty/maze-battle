import { initializeCanonical } from '../../src/persistence/canonical/lifecycle';
import { executeCanonical, canonicalFence } from '../../src/persistence/canonical/transaction';
import { readCanonical, readCanonicalHead, snapshotOf } from '../../src/persistence/canonical/read';
import { loadGameplayTelemetry, readGameplayTelemetry, recordGameplay } from '../../src/persistence/canonical/telemetry/records';
import { GAMEPLAY_TRACE_CAPACITY, GAMEPLAY_TRACE_HEADER, gameplayTraceSlot } from '../../src/persistence/canonical/telemetry/types';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { storedBytes } from '../../src/persistence/canonical/accounting';
import { CANONICAL_STORES, type CanonicalHead, type CanonicalRequest } from '../../src/persistence/canonical/types';
import { storageProbe } from './storage-probe';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5581') throw Error('Isolated native telemetry fixture only');

function command(head: CanonicalHead, sequence: number, attemptId = `telemetry-${sequence}`): CanonicalRequest {
  return { attemptId, operation: 'fixture.telemetry.reward', input: { sequence },
    expected: canonicalFence(head), deadlineAt: null };
}

/** Authored marker, not an RPG quest claim. Exercises the unchanged kernel/trace against native IDB. */
async function append(head: CanonicalHead, sequence: number, attemptId?: string) {
  const request = command(head, sequence, attemptId);
  const result = await executeCanonical(request, async tx => {
    await tx.pages.set('world', 'fixture/wallet', { gold: sequence });
    await recordGameplay(tx, { kind: 'reward', command: 'claim-quest', targetId: `authored-${sequence}`,
      walletGoldBefore: sequence - 1, walletGoldAfter: sequence, lootAwardCount: 0 });
    tx.setCheckpoint({ walletGold: sequence });
    return { applied: true, walletGold: sequence };
  });
  return { request, result };
}

/** Test-only exact store comparison, deliberately outside the measured public trace-reader interval. */
async function audit() {
  const db = await openCanonicalDatabase();
  try {
    const tx = db.transaction(CANONICAL_STORES, 'readonly'), rows = [], counts: Record<string, number> = {};
    let bytes = 0;
    for (const name of CANONICAL_STORES) {
      const values = await tx.objectStore(name).getAll(), keys = await tx.objectStore(name).getAllKeys();
      counts[name] = values.length; rows.push([name, keys, values]);
      if (name !== 'meta') values.forEach((value, i) => { bytes += storedBytes(name, keys[i], value); });
    }
    await tx.done;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(rows)));
    return { counts, bytes, sha256: [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('') };
  } finally { db.close(); }
}

function boundedReaderProbe() {
  const meter = storageProbe(), restore: (() => void)[] = [], forbidden: string[] = [];
  const targets = [
    { kind: 'store', prototype: IDBObjectStore.prototype, methods: ['getAll', 'getAllKeys', 'count', 'openCursor', 'openKeyCursor'] },
    { kind: 'index', prototype: IDBIndex.prototype, methods: ['get', 'getKey', 'getAll', 'getAllKeys', 'count', 'openCursor', 'openKeyCursor'] },
  ];
  for (const { kind, prototype, methods } of targets) for (const method of methods) {
    const original = Object.getOwnPropertyDescriptor(prototype, method)!;
    Object.defineProperty(prototype, method, { ...original, value() {
      forbidden.push(`${kind}.${method}`); throw Error('Trace reader cannot enumerate or use secondary indexes');
    } });
    restore.push(() => Object.defineProperty(prototype, method, original));
  }
  return { finish() { for (const reset of restore.reverse()) reset(); return { ...meter.finish(), forbidden }; } };
}

const api = { initializeCanonical, executeCanonical, readCanonical, readCanonicalHead, snapshotOf, readGameplayTelemetry,
  loadGameplayTelemetry, recordGameplay, GAMEPLAY_TRACE_CAPACITY, GAMEPLAY_TRACE_HEADER, gameplayTraceSlot,
  command, append, audit, storageProbe, boundedReaderProbe };
declare global { interface Window { nativeTelemetry: typeof api } }
window.nativeTelemetry = api;
