import { createGameActionHooks } from '../../src/services/agentica/game/actionHooks';
import type { GameSession } from '../../src/services/game/GameSession';
import { executeCanonical } from '../../src/persistence/canonical/transaction';
import { retainPublication } from '../../src/persistence/canonical/agentica/publication';
import { snapshotReference } from '../../src/persistence/canonical/agentica/validation';
import type { ProtocolRef } from '../../src/persistence/canonical/agentica/types';
import type { JsonObject } from '../../src/persistence/canonical/types';
import { same } from '../../src/persistence/canonical/world/records';
import { deferred, failure, head, key, pending, retained, setup } from './canonical-agentica-action-guards.setup';

async function publishAgain(session: GameSession) {
  const receipt = await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.publication', input: {},
    execute: (r, options) => executeCanonical(r, async tx => (await retainPublication(tx, r)).receipt, options) });
  return snapshotReference((receipt.result as JsonObject).reference as unknown as ProtocolRef);
}

export async function changedPublication(race: boolean) {
  const c = await setup(), entered = deferred(), release = deferred();
  try {
    const publication = await publishAgain(c.session);
    let submissions = 0, missed = false;
    const other = createGameActionHooks({ submitHostCommand: async command => {
      submissions++; entered.resolve();
      if (race) await release.promise;
      return c.session.submitHostCommand(command);
    } }, { ...c.binding, publication });
    const reserve = () => c.hooks.saveAction(key(c.action), pending(c.action));
    if (!race) await reserve();
    // This barrier is outside IndexedDB and the owned queue: P1 can commit before P2 enters it.
    const raced = race ? other.saveAction(key(c.action), pending(c.action)).then(() => null, failure) : undefined;
    if (raced) {
      await Promise.race([entered.promise, raced.then(() => { throw Error('Fixture expected a preflight miss'); })]);
      missed = (await retained(c.action)).original === null;
      await reserve();
    }
    const before = await head(), original = await retained(c.action);
    release.resolve();
    const rejected = await (raced ?? other.saveAction(key(c.action), pending(c.action)).then(() => null, failure));
    await c.session.flush();
    const retry = await other.onAction(c.action), after = await retained(c.action);
    return { rejected, submissions, missed, different: !same(publication, c.binding.publication),
      unchanged: same(before, await head()), originalUnchanged: same(original, after),
      publication: after.original?.original.publication, expectedPublication: c.binding.publication,
      pending: !!after.original && !after.original.result, operation: after.operation, destination: after.destination,
      retry: retry.disposition };
  } finally { release.resolve(); c.session.stop(); }
}

export async function samePublication() {
  const c = await setup();
  try {
    await c.hooks.saveAction(key(c.action), pending(c.action));
    const before = await head(), original = await retained(c.action);
    let writes = 0;
    const cold = createGameActionHooks({ submitHostCommand: async () => { writes++; throw Error('Duplicate reservation attempted a write'); } }, c.binding);
    await c.hooks.saveAction(key(c.action), pending(c.action));
    await cold.saveAction(key(c.action), pending(c.action));
    const retry = await cold.onAction(c.action), reconciled = await cold.reconcileAction!(c.action, pending(c.action));
    const unchanged = same(before, await head()) && same(original, await retained(c.action));
    const completion = await c.hooks.onAction(c.action);
    return { writes, retry: retry.disposition, reconciled, unchanged, completion: completion.disposition,
      effects: c.submitted.operations.filter(name => name === 'operation.admit').length };
  } finally { c.session.stop(); }
}

export async function completedDifferentPublication() {
  const c = await setup();
  try {
    await c.hooks.saveAction(key(c.action), pending(c.action));
    const result = await c.hooks.onAction(c.action), publication = await publishAgain(c.session);
    await c.session.cleanupHostOperation({ kind: 'cancel', target: c.guard }); c.session.stop();
    let writes = 0;
    const other = createGameActionHooks({ submitHostCommand: async () => { writes++; throw Error('Completed replay attempted a write'); } },
      { ...c.binding, publication });
    const before = await head(), original = await retained(c.action);
    const loaded = await other.loadAction(key(c.action));
    await other.saveAction(key(c.action), { ...pending(c.action), status: 'completed', result });
    const reconciled = await other.reconcileAction!(c.action, null), replayed = await other.onAction(c.action);
    const pendingRejected = await other.saveAction(key(c.action), pending(c.action)).then(() => null, failure);
    return { writes, different: !same(publication, c.binding.publication), status: loaded?.status,
      exact: [loaded?.result, reconciled, replayed].every(value => same(value, result)), pendingRejected,
      unchanged: same(before, await head()) && same(original, await retained(c.action)) };
  } finally { c.session.stop(); }
}
