import { controlCanonical, executeCanonical, operateCanonical } from '../../src/persistence/canonical/transaction';
import { readCanonical } from '../../src/persistence/canonical/read';
import { initializeCanonical, resetCanonical } from '../../src/persistence/canonical/lifecycle';
import { cleanup, command, current, dump, failure, owner, seeded } from './custody-recovery.support';
import { hostCleanup } from './custody-recovery.host';

async function funded() {
  const { ids, stopped } = await seeded(), before = await dump();
  const normal = await failure(() => controlCanonical(command(stopped, 'control.claim', { owner: owner(1) }), 'claim'));
  const normalUnchanged = before.content === (await dump()).content;
  await controlCanonical(command(stopped, 'control.claim', { owner: owner(1), recovery: true }), 'claim');
  const claimed = await current(), originals = (await readCanonical(async pages => {
    const values = []; for (const id of ids) values.push(await pages.liveOperation(id)); return values;
  })).value;
  let effects = 0;
  const ordinary = await failure(() => executeCanonical(command(claimed, 'fixture.gameplay', {}), async () => { effects++; return null; }));
  const adopt = await failure(() => operateCanonical(command(claimed, 'operation.adopt', { operationId: ids[0] }), 'adopt'));
  const resume = await failure(() => controlCanonical(command(claimed, 'control.resume', { owner: claimed.owner }), 'resume'));
  const failedWritesUnchanged = JSON.stringify(claimed) === JSON.stringify(await current());
  const wrongAck = await failure(() => operateCanonical(command(claimed, 'operation.acknowledge', {
    operationId: ids[0], terminalAttemptId: 'not-the-original',
  }), 'acknowledge'));
  const done = await cleanup(ids);
  return { stopped, claimed, normal, normalUnchanged, ordinary, adopt, resume, wrongAck, effects, failedWritesUnchanged,
    originalsUnadopted: originals.every(op => op && op.owner === stopped.owner && op.epoch < claimed.epoch && op.state === 'admitted'), ...done };
}

async function exhausted() {
  const { ids, stopped } = await seeded();
  let count = 0, error = '', unchanged = false;
  for (let i = 1; i <= 256; i++) {
    const before = await dump();
    try { await controlCanonical(command(await current(), 'control.claim', { owner: owner(i), recovery: true }), 'claim'); count++; }
    catch (e) { error = String(e); unchanged = before.content === (await dump()).content; break; }
  }
  if (!error) throw Error('Recovery headroom failed to bound claims');
  const exhausted = await current(), done = await cleanup(ids);
  return { count, error, unchanged, stopped, exhausted, ...done };
}

async function replayAndFences() {
  const { stopped } = await seeded(1), request = command(stopped, 'control.claim', { owner: owner(1), recovery: true });
  request.deadlineAt = Date.now() + 60_000;
  const original = structuredClone(request), pending = controlCanonical(request, 'claim');
  request.input = { owner: 'mutated', recovery: true }; request.expected.owner = 'mutated';
  const first = await pending, claimed = await current();
  await controlCanonical(command(claimed, 'control.claim', { owner: owner(2), recovery: true }), 'claim');
  const before = await dump(), now = Date.now;
  let replay;
  try { Date.now = () => original.deadlineAt! + 1; replay = await controlCanonical(original, 'claim'); }
  finally { Date.now = now; }
  const replayUnchanged = before.content === (await dump()).content;
  const changed = await failure(() => controlCanonical({ ...original, input: { owner: owner(3), recovery: true } }, 'claim'));
  const stale = await failure(() => controlCanonical(command(claimed, 'control.claim', { owner: owner(3), recovery: true }), 'claim'));
  const currentHead = await current(), expired = command(currentHead, 'control.claim', { owner: owner(4), recovery: true });
  expired.deadlineAt = 1;
  const expiration = await failure(() => controlCanonical(expired, 'claim'));
  const generation = { ...command(currentHead, 'control.claim', { owner: owner(5), recovery: true }),
    expected: { ...original.expected, generation: 'wrong-generation' } };
  const wrongGeneration = await failure(() => controlCanonical(generation, 'claim'));
  const allUnchanged = before.content === (await dump()).content;
  await resetCanonical(owner(9), {});
  const afterReset = await failure(() => controlCanonical(original, 'claim'));
  return { claimedOwner: claimed.owner, replayed: replay.replayed, sameReceipt: JSON.stringify(first.receipt) === JSON.stringify(replay.receipt),
    replayUnchanged, changed, stale, expiration, wrongGeneration, allUnchanged, afterReset };
}

async function competing() {
  const { stopped } = await seeded(1), before = stopped.revision;
  const outcomes = await Promise.allSettled([1, 2].map(n => controlCanonical(command(stopped, 'control.claim', { owner: owner(n), recovery: true }), 'claim')));
  const head = await current();
  return { statuses: outcomes.map(o => o.status), errors: outcomes.filter(o => o.status === 'rejected').map(o => String(o.reason)),
    revisionDelta: head.revision - before, head };
}

async function controlModes() {
  const { head: ready } = await initializeCanonical(owner(0), {}), before = await dump();
  const claimReady = await failure(() => controlCanonical(command(ready, 'control.claim', { owner: owner(1), recovery: true }), 'claim'));
  let effects = 0;
  const reserved = await failure(() => executeCanonical(command(ready, 'control.claim', { owner: owner(1), recovery: true }),
    async () => { effects++; return null; }));
  const unchanged = before.content === (await dump()).content;
  await controlCanonical(command(ready, 'control.stop', { owner: ready.owner }), 'stop');
  const stopped = await current(), sameOwner = await failure(() => controlCanonical(command(stopped, 'control.claim', {
    owner: stopped.owner, recovery: true,
  }), 'claim'));
  await controlCanonical(command(stopped, 'control.claim', { owner: owner(1) }), 'claim');
  const claimed = await current(), failedResume = await failure(() => controlCanonical(command(claimed, 'control.resume', {
    owner: claimed.owner, recovery: true,
  }), 'resume'));
  const resumeUnchanged = JSON.stringify(claimed) === JSON.stringify(await current());
  await controlCanonical(command(claimed, 'control.resume', { owner: claimed.owner }), 'resume');
  return { claimReady, reserved, effects, unchanged, sameOwner, failedResume, resumeUnchanged, claimed, resumed: await current() };
}

async function rollback(point: 'receipt' | 'head' | 'abort') {
  const { stopped } = await seeded(1), request = command(stopped, 'control.claim', { owner: owner(1), recovery: true });
  const before = await dump(), add = IDBObjectStore.prototype.add, put = IDBObjectStore.prototype.put, abort = new AbortController();
  IDBObjectStore.prototype.add = function(...args) {
    if (this.transaction.db.name === 'maze-battle' && this.name === 'receipts' && point === 'receipt')
      throw new DOMException('Injected full disk', 'QuotaExceededError');
    return Reflect.apply(add, this, args);
  };
  IDBObjectStore.prototype.put = function(...args) {
    if (this.transaction.db.name === 'maze-battle' && this.name === 'heads') {
      if (point === 'head') throw new DOMException('Injected full disk', 'QuotaExceededError');
      if (point === 'abort') abort.abort();
    }
    return Reflect.apply(put, this, args);
  };
  let error;
  try { error = await failure(() => controlCanonical(request, 'claim', { signal: abort.signal })); }
  finally { IDBObjectStore.prototype.add = add; IDBObjectStore.prototype.put = put; }
  const unchanged = before.content === (await dump()).content, result = await controlCanonical(request, 'claim');
  const after = await dump(), replay = await controlCanonical(request, 'claim');
  return { error, unchanged, replayed: replay.replayed, sameReceipt: JSON.stringify(result.receipt) === JSON.stringify(replay.receipt),
    replayUnchanged: after.content === (await dump()).content };
}

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5242') throw Error('Isolated custody recovery fixture only');
const api = { funded, exhausted, replayAndFences, competing, controlModes, rollback, hostCleanup };
declare global { interface Window { custodyRecovery: typeof api } }
window.custodyRecovery = api;
