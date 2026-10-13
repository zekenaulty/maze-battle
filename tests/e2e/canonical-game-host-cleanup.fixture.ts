import { GameSession } from '../../src/services/game/GameSession';
import { HostCleanupError } from '../../src/services/game/CanonicalHostRecovery';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { accountHead } from '../../src/persistence/canonical/accounting';
import { controlCanonical, operateCanonical } from '../../src/persistence/canonical/transaction';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { gameRequest } from '../../src/services/game/canonicalRequests';
import { MIN_TERMINAL_BYTES } from '../../src/persistence/canonical/types';

const view = (s: GameSession) => ({ status: s.view.status, controlled: s.view.controlled, recoveryRequired: s.view.recoveryRequired });
async function admitted() {
  const s = new GameSession(() => {}); await s.start();
  const { head } = await readCanonicalHead(), target = { gameId: head.gameId, generation: head.generation, operationId: crypto.randomUUID() };
  await s.submitHostCommand({ kind: 'fresh', operation: 'operation.admit',
    input: { operationId: target.operationId, binding: { kind: 'fixture-cleanup-guard' }, terminalBytes: MIN_TERMINAL_BYTES },
    execute: (r, options) => operateCanonical(r, 'admit', async () => ({}), options) });
  return { s, target };
}
async function lowerQuota() {
  const db = await openCanonicalDatabase(), { head } = await readCanonicalHead();
  // Fixture policy injection only; preserve logical accounting and all funded reservations.
  const next = accountHead(head, { ...head, quota: { ...head.quota,
    limitBytes: head.quota.usedBytes + head.quota.reservedBytes + head.quota.reserveBytes + 16 } }, 0);
  await db.put('heads', next, next.gameId); db.close();
}
export async function fundedCleanup() {
  const { s, target } = await admitted(); await lowerQuota();
  const failure = await s.execute('settings', { kind: 'throttle', ms: 100 }).catch(String); await s.flush();
  const failedView = view(s), cancelled = await s.cleanupHostOperation({ kind: 'cancel', target });
  const replay = await s.cleanupHostOperation({ kind: 'retry', request: cancelled.request });
  const acknowledged = await s.cleanupHostOperation({ kind: 'acknowledge', target, terminalAttemptId: cancelled.receipt.attemptId });
  const final = await readCanonical(p => p.liveOperation(target.operationId));
  const status = view(s); s.stop();
  return { failure, failedView, status, same: JSON.stringify(cancelled.receipt) === JSON.stringify(replay.receipt),
    terminal: acknowledged.receipt.result, operation: final.value, quota: final.head.quota };
}
export async function ambiguousCleanup() {
  const { s, target } = await admitted(), put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function(...args) {
    if (this.transaction.db.name === 'maze-battle' && this.name === 'operations') throw new DOMException('Injected disk refusal', 'QuotaExceededError');
    return Reflect.apply(put, this, args);
  };
  let original;
  try { await s.cleanupHostOperation({ kind: 'cancel', target }); }
  catch (error) { if (!(error instanceof HostCleanupError)) throw error; original = error.request; }
  finally { IDBObjectStore.prototype.put = put; }
  if (!original) throw Error('Missing original failed cleanup');
  const result = await s.cleanupHostOperation({ kind: 'retry', request: original });
  const op = (await readCanonical(p => p.liveOperation(target.operationId))).value;
  s.stop(); return { original, receipt: result.receipt, op };
}
export async function cleanupAfterFailedResume() {
  const { s, target } = await admitted(); s.stop();
  const replacement = new GameSession(() => {}); await lowerQuota();
  const error = await replacement.takeControl().catch(String); await replacement.flush();
  const before = (await readCanonicalHead()).head, state = view(replacement);
  const result = await replacement.cleanupHostOperation({ kind: 'cancel', target });
  const after = (await readCanonicalHead()).head, final = view(replacement); replacement.stop();
  return { error, sameOwner: before.owner === replacement.owner, beforeStatus: before.status, afterStatus: after.status,
    result: result.receipt.result, state, final };
}
export async function foreignOwner() {
  const { s, target } = await admitted();
  const { head } = await readCanonicalHead();
  await controlCanonical(gameRequest(head, 'control.takeover', { owner: 'fixture-other-owner' }), 'takeover');
  const before = (await readCanonicalHead()).head;
  const error = await s.cleanupHostOperation({ kind: 'cancel', target }).catch(String);
  const unchanged = JSON.stringify(before) === JSON.stringify((await readCanonicalHead()).head); s.stop();
  return { error, unchanged };
}
export async function resetInvalidation() {
  const { s, target } = await admitted();
  const results = await Promise.allSettled([s.cleanupHostOperation({ kind: 'cancel', target }), s.resetGame()]);
  const failure = await s.cleanupHostOperation({ kind: 'cancel', target }).catch(String);
  const head = (await readCanonicalHead()).head; s.stop();
  return { results: results.map(r => r.status), failure, replaced: head.generation !== target.generation, allocations: head.allocations };
}
Object.assign(window, { cleanupFixture: { fundedCleanup, ambiguousCleanup, cleanupAfterFailedResume, foreignOwner, resetInvalidation } });
