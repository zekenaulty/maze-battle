import { expect, type BrowserContext, type Page } from '@playwright/test';
import type { CanonicalRecord } from '../../src/persistence/canonical/types';
import { gameplayFact } from '../../src/persistence/canonical/telemetry/validation';
import { appGame, installAutoKillCapture } from './canonical-app-auto-kill.support';

export async function isolate(context: BrowserContext, baseURL: string | undefined) {
  if (!baseURL) throw Error('Missing disposable fixture origin');
  const url = new URL(baseURL), denied: string[] = [];
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw Error('Expected local fixture origin');
  await context.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).origin === url.origin.replace(/^http:/, 'ws:')) socket.connectToServer();
    else { denied.push(socket.url()); socket.close(); }
  });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === url.origin) return route.continue();
    denied.push(route.request().url()); return route.abort();
  });
  await context.addInitScript(installAutoKillCapture, { seed: 781, origin: url.origin });
  return denied;
}

export async function stable(page: Page) {
  const before = await appGame(page);
  await page.waitForTimeout(2300);
  expect((await appGame(page)).snapshot).toEqual(before.snapshot);
}

interface MutationCount { attempted: number; committed: number; logicalBytes: number; failed: number }
interface EnduranceCapture { events: CanonicalRecord[]; writes: Record<string, MutationCount>; overflow: boolean }
declare global { interface Window { enduranceCapture: EnduranceCapture } }

/** Passive native mutation accounting. Bytes include store/key/value JSON, not physical disk IO. */
export function installEnduranceCapture({ origin }: { origin: string }) {
  if (location.origin !== origin) return;
  const evidence = window.enduranceCapture = { events: [], writes: {}, overflow: false } as EnduranceCapture;
  for (const method of ['put', 'add', 'delete', 'clear'] as const) {
    const original = IDBObjectStore.prototype[method];
    Object.defineProperty(IDBObjectStore.prototype, method, { configurable: true, writable: true,
      value: function(this: IDBObjectStore, ...args: unknown[]) {
        const request = Reflect.apply(original, this, args);
        if (this.transaction.db.name !== 'maze-battle') return request;
        const store = this.name, count = evidence.writes[`${store}.${method}`] ??= { attempted: 0, committed: 0, logicalBytes: 0, failed: 0 };
        count.attempted++;
        const value = method === 'put' || method === 'add' ? structuredClone(args[0]) : undefined;
        const bytes = value === undefined ? 0 : new TextEncoder().encode(JSON.stringify([store, args[1], value])).byteLength;
        this.transaction.addEventListener('abort', () => { count.failed++; }, { once: true });
        this.transaction.addEventListener('complete', () => {
          count.committed++; count.logicalBytes += bytes;
          if (store === 'records' && value && typeof value === 'object' && 'key' in value
            && typeof value.key === 'string' && value.key.startsWith('telemetry/gameplay/slot/')) {
            if (evidence.events.length >= 4096) evidence.overflow = true;
            else evidence.events.push(value as CanonicalRecord);
          }
        }, { once: true });
        return request;
      } });
  }
}

export function drain(page: Page) {
  return page.evaluate(() => {
    const base = window.autoKillEvidence, extra = window.enduranceCapture;
    return { seedCalls: base.seedCalls, overflow: base.overflow || extra.overflow,
      heads: base.heads.splice(0), receipts: base.receipts.splice(0), events: extra.events.splice(0), writes: structuredClone(extra.writes) };
  });
}

export function eventOf(record: CanonicalRecord) {
  const v = record.value;
  if (!v || typeof v !== 'object' || Array.isArray(v) || v.schema !== 1
    || typeof v.sequence !== 'number' || typeof v.at !== 'string' || !('fact' in v)) throw Error('Invalid captured telemetry envelope');
  return { sequence: v.sequence, revision: record.revision, at: v.at, fact: gameplayFact(v.fact) };
}

/** Read-only bounded policy state for diagnostics, never used to choose a move or target. */
export function policy(page: Page) {
  return page.evaluate(async () => {
    const { readCanonical } = await import('/src/persistence/canonical/read.ts');
    const { loadAutoState } = await import('/src/persistence/canonical/auto/records.ts');
    return (await readCanonical(loadAutoState)).value;
  });
}

/** Privileged counts at stopped boundaries only; no world/receipt enumeration. */
export function storage(page: Page) {
  return page.evaluate(async () => {
    const { readCanonicalHead } = await import('/src/persistence/canonical/read.ts');
    const { openCanonicalDatabase } = await import('/src/persistence/canonical/database.ts');
    const { head } = await readCanonicalHead(), db = await openCanonicalDatabase();
    try { return { head, records: await db.count('records'), nodes: await db.count('nodes'), receipts: await db.count('receipts'),
      approximateOriginUsage: (await navigator.storage.estimate()).usage }; }
    finally { db.close(); }
  });
}

export function trace(page: Page) {
  return page.evaluate(async () => {
    const { readCanonicalHead } = await import('/src/persistence/canonical/read.ts');
    const { readGameplayTelemetry } = await import('/src/persistence/canonical/telemetry/records.ts');
    return readGameplayTelemetry((await readCanonicalHead()).snapshot);
  });
}
