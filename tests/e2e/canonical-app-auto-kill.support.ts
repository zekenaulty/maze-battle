import type { Page } from '@playwright/test';
import type { CanonicalHead, CanonicalReceipt, CanonicalSnapshot } from '../../src/persistence/canonical/types';
import type { GameView } from '../../src/services/game/GameView';
import type { AutoState } from '../../src/persistence/canonical/auto/types';

export interface AutoKillEvidence {
  seed: number; seedCalls: number; overflow: boolean;
  heads: CanonicalHead[]; receipts: CanonicalReceipt[];
}
declare global { interface Window { autoKillEvidence: AutoKillEvidence } }

/** Disposable-origin RNG boundary and passive committed-write capture. No commands or scheduling hooks. */
export function installAutoKillCapture({ seed, origin }: { seed: number; origin: string }) {
  if (location.origin !== origin) return;
  const evidence: AutoKillEvidence = window.autoKillEvidence = { seed, seedCalls: 0, overflow: false, heads: [], receipts: [] };
  const randomValues = crypto.getRandomValues;
  Object.defineProperty(crypto, 'getRandomValues', { configurable: true, value: <T extends ArrayBufferView<ArrayBuffer>>(array: T): T => {
    randomValues.call(crypto, array);
    if (array instanceof Uint32Array && array.length === 1) { array[0] = seed; evidence.seedCalls++; }
    return array;
  } });
  Math.random = () => 0.5;
  for (const method of ['put', 'add'] as const) {
    const original = IDBObjectStore.prototype[method];
    Object.defineProperty(IDBObjectStore.prototype, method, { configurable: true, writable: true,
      value: function(this: IDBObjectStore, ...args: unknown[]) {
        const request = Reflect.apply(original, this, args);
        if (this.transaction.db.name === 'maze-battle' && ['heads', 'receipts'].includes(this.name)) {
          const value = structuredClone(args[0]), store = this.name;
          this.transaction.addEventListener('complete', () => {
            if (evidence.heads.length + evidence.receipts.length >= 4096) { evidence.overflow = true; return; }
            if (store === 'heads') evidence.heads.push(value as CanonicalHead);
            else evidence.receipts.push(value as CanonicalReceipt);
          }, { once: true });
        }
        return request;
      } });
  }
}

export function appGame(page: Page, snapshot?: CanonicalSnapshot) {
  return page.evaluate<GameView, string | undefined>(async serialized => {
    const snapshot: CanonicalSnapshot | undefined = serialized === undefined ? undefined : JSON.parse(serialized);
    const { readCanonical } = await import('/src/persistence/canonical/read.ts');
    const { projectGameSnapshot } = await import('/src/persistence/canonical/game/projection.ts');
    return (await readCanonical(projectGameSnapshot, { snapshot })).value;
  }, snapshot === undefined ? undefined : JSON.stringify(snapshot));
}
export function retainedAuto(page: Page, snapshot: CanonicalSnapshot) {
  return page.evaluate<AutoState | null, string>(async serialized => {
    const snapshot: CanonicalSnapshot = JSON.parse(serialized);
    const { readCanonical } = await import('/src/persistence/canonical/read.ts');
    const { loadAutoState } = await import('/src/persistence/canonical/auto/records.ts');
    return (await readCanonical(loadAutoState, { snapshot })).value;
  }, JSON.stringify(snapshot));
}
export function snapshotAt(evidence: AutoKillEvidence, revision: number): CanonicalSnapshot {
  const head = evidence.heads.find(h => h.revision === revision);
  if (!head) throw Error(`No captured committed head at revision ${revision}`);
  const { gameId, generation, roots, checkpoint } = head;
  return { gameId, generation, revision, roots, checkpoint };
}
export function actionOf(receipt: CanonicalReceipt) {
  const result = receipt.result;
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  const action = result.action;
  return action && typeof action === 'object' && !Array.isArray(action) ? action : null;
}
export function operationOf(receipt: CanonicalReceipt) {
  const request: unknown = JSON.parse(receipt.fingerprint);
  if (!request || typeof request !== 'object' || !('operation' in request) || typeof request.operation !== 'string')
    throw Error('Captured receipt has no original operation');
  return request.operation;
}
