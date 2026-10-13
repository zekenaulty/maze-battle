import { executeCanonical } from '../../src/persistence/canonical/transaction';
import type { CanonicalRecord } from '../../src/persistence/canonical/types';
import { isObject } from '../../src/persistence/canonical/validation';
import { prepareAction } from '../../src/persistence/canonical/agentica/actions';
import { same } from '../../src/persistence/canonical/world/records';
import { deferred, failure, head, key, pending, retained, setup } from './canonical-agentica-action-guards.setup';

export async function capabilityExpiry(phase: 'queued' | 'commit') {
  const c = await setup(), now = Date.now, put = IDBObjectStore.prototype.put, add = IDBObjectStore.prototype.add;
  let expired = false, effectDeadline: number | null = null;
  const deadline = Date.parse(c.action.deadlineAt);
  try {
    await c.hooks.saveAction(key(c.action), pending(c.action));
    const identity = await prepareAction(c.action), original = (await retained(c.action)).original!;
    const before = await head();
    let rejected: string | null;
    if (phase === 'queued') {
      const entered = deferred(), release = deferred(), submitted = deferred();
      const blocker = c.session.submitHostCommand({ kind: 'fresh', operation: 'fixture.queue-barrier', input: {},
        execute: async (request, options) => {
          entered.resolve(); await release.promise;
          return executeCanonical(request, async () => ({ barrier: true }), options);
        } });
      await entered.promise;
      c.submitted.inspect = command => { if (command.kind === 'fresh' && command.operation === 'operation.admit') submitted.resolve(); };
      const effect = c.hooks.onAction(c.action).then(() => null, failure);
      try {
        await Promise.race([submitted.promise, effect.then(() => { throw Error('Fixture expected a queued admission'); })]);
        Date.now = () => deadline + 1; expired = true;
      } finally { release.resolve(); }
      await blocker; rejected = await effect;
    } else {
      IDBObjectStore.prototype.add = function(...args) {
        const row = args[0] as CanonicalRecord;
        if (this.transaction.db.name === 'maze-battle' && this.name === 'records' && row.key === `${identity.storageKey}/result`) {
          if (!isObject(row.value) || !isObject(row.value.sourceRequest) || typeof row.value.sourceRequest.deadlineAt !== 'number')
            throw Error('Fixture expected an action-pinned result source');
          effectDeadline = row.value.sourceRequest.deadlineAt;
        }
        return Reflect.apply(add, this, args);
      };
      // Advance the action clock only after the kernel has staged the atomic result/admission writes.
      IDBObjectStore.prototype.put = function(...args) {
        if (this.transaction.db.name === 'maze-battle' && this.name === 'heads') { Date.now = () => deadline + 1; expired = true; }
        return Reflect.apply(put, this, args);
      };
      rejected = await c.hooks.onAction(c.action).then(() => null, failure);
    }
    Date.now = now; IDBObjectStore.prototype.put = put; IDBObjectStore.prototype.add = add;
    await c.session.flush();
    const after = await head(), audit = await retained(c.action);
    return { rejected, expired, deadline, reservedDeadline: original.original.sourceRequest.deadlineAt,
      effectDeadline, revisionDelta: after.revision - before.revision,
      gameUnchanged: same(before.checkpoint, after.checkpoint) && same(before.roots, after.roots),
      pending: !!audit.original && !audit.original.result, operation: audit.operation, destination: audit.destination };
  } finally {
    Date.now = now; IDBObjectStore.prototype.put = put; IDBObjectStore.prototype.add = add; c.session.stop();
  }
}
