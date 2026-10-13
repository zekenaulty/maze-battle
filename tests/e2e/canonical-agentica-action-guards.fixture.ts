import { createGameActionHooks } from '../../src/services/agentica/game/actionHooks';
import { actionFingerprint } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { same } from '../../src/persistence/canonical/world/records';
import { capabilityExpiry } from './canonical-agentica-action-guards.expiry';
import { changedPublication, samePublication, completedDifferentPublication } from './canonical-agentica-action-guards.publication';
import { failure, head, key, pending, retained, setup, type Capability } from './canonical-agentica-action-guards.setup';
export { changedPublication, samePublication, completedDifferentPublication };

export async function invalidated(kind: 'cancel' | 'move', capability: Capability) {
  const c = await setup(capability);
  try {
    await c.hooks.saveAction(key(c.action), pending(c.action));
    const position = c.session.view.game!.checkpoint.position;
    if (kind === 'cancel') await c.session.cleanupHostOperation({ kind: 'cancel', target: c.guard });
    else await c.session.execute('exploration', { kind: 'move', direction: c.direction, triggerStairs: false });
    const before = await head();
    const rejected = await c.hooks.onAction(c.action).then(() => null, failure); await c.session.flush();
    const audit = await retained(c.action), after = await head();
    const repeat = await c.hooks.onAction(c.action);
    const cold = createGameActionHooks(c.port, c.binding);
    const recovered = await cold.reconcileAction!(c.action, pending(c.action));
    return { rejected, unchanged: same(before, after), moved: !same(position, c.session.view.game!.checkpoint.position),
      pending: !!audit.original && !audit.original.result, operation: audit.operation, destination: audit.destination,
      repeat: repeat.disposition, recovered };
  } finally { c.session.stop(); }
}

export async function concurrent(separate: boolean, capability: Capability) {
  const c = await setup(capability);
  try {
    const second = separate ? createGameActionHooks(c.port, c.binding) : c.hooks;
    await Promise.all([c.hooks.saveAction(key(c.action), pending(c.action)), second.saveAction(key(c.action), pending(c.action))]);
    const before = await head();
    const results = await Promise.all([c.hooks.onAction(c.action), second.onAction(c.action)]);
    const after = await head(), audit = await retained(c.action);
    const replay = await second.onAction(c.action);
    const operation = capability === 'maze.navigate' ? 'operation.admit' : 'agentica.action.resolve';
    return { dispositions: results.map(r => r.disposition).sort(), commits: after.revision - before.revision,
      submissions: c.submitted.operations.filter(name => name === operation).length,
      resolvedExact: results.filter(r => r.disposition === 'applied').every(r => same(r, audit.original?.result)),
      completed: audit.original?.result, exactReplay: same(replay, audit.original?.result), replayUnchanged: same(after, await head()),
      operation: audit.operation, destination: audit.destination, publicationRevision: c.action.expectedRevision,
      resultSourceRevision: audit.original?.resultReference ? after.revision : null };
  } finally { c.session.stop(); }
}

export async function changedFingerprint() {
  const c = await setup();
  try {
    await c.hooks.saveAction(key(c.action), pending(c.action));
    const changed = structuredClone(c.action); changed.arguments.column = Number(changed.arguments.column) + 1;
    const before = await head();
    const errors = [await c.hooks.saveAction(key(changed), pending(changed)).then(() => null, failure),
      await c.hooks.onAction(changed).then(() => null, failure),
      await c.hooks.reconcileAction!(changed, pending(changed)).then(() => null, failure)];
    const audit = await retained(c.action), unchanged = same(before, await head());
    const original = await c.hooks.onAction(c.action);
    return { sameKey: key(changed) === key(c.action), errors, unchanged, pending: !!audit.original && !audit.original.result,
      operationBefore: audit.operation, original: original.disposition };
  } finally { c.session.stop(); }
}

export async function completedAfterStop() {
  const c = await setup();
  try {
    await c.hooks.saveAction(key(c.action), pending(c.action));
    const original = await c.hooks.onAction(c.action);
    await c.session.cleanupHostOperation({ kind: 'cancel', target: c.guard }); c.session.stop();
    let writes = 0;
    const cold = createGameActionHooks({ hostSignal: c.session.hostSignal, submitHostCommand: async () => { writes++; throw Error('Replay attempted a write'); } }, c.binding);
    const before = await head(), loaded = await cold.loadAction(key(c.action));
    await cold.saveAction(key(c.action), { fingerprint: actionFingerprint(c.action), status: 'completed', result: original });
    const reconciled = await cold.reconcileAction!(c.action, null), replayed = await cold.onAction(c.action);
    const fabricated = structuredClone(original); fabricated.summary = 'Not the original result';
    const rejected = await cold.saveAction(key(c.action), { fingerprint: actionFingerprint(c.action), status: 'completed', result: fabricated }).then(() => null, failure);
    return { writes, status: loaded?.status, exact: [loaded?.result, reconciled, replayed].every(r => same(r, original)),
      unchanged: same(before, await head()), rejected };
  } finally { c.session.stop(); }
}

export async function capturedInputs() {
  const c = await setup();
  try {
    const original = structuredClone(c.action), record = pending(original), reservation = c.hooks.saveAction(key(original), record);
    record.fingerprint = 'changed after submission'; c.binding.publication.id = 'changed-publication'; c.binding.grant.id = 'changed-grant';
    await reservation;
    const execution = c.hooks.onAction(c.action); c.action.arguments.column = 511; c.action.deadlineAt = '2000-01-01T00:00:00.000Z';
    const result = await execution, audit = await retained(original);
    return { disposition: result.disposition, original: same(audit.original?.original.action, original),
      target: audit.operation?.binding, expectedTarget: c.target };
  } finally { c.session.stop(); }
}

Object.assign(window, { actionGuards: { invalidated, concurrent, changedFingerprint, completedAfterStop, capturedInputs, capabilityExpiry,
  changedPublication, samePublication, completedDifferentPublication } });
