import type {} from './canonical-agentica-operations.fixture';
import { createGameActionHooks } from '../../src/services/agentica/game/actionHooks';
import type { CanonicalHostPort } from '../../src/services/game/CanonicalHostCommand';
import { actionFingerprint, actionKey } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { retainPublication } from '../../src/persistence/canonical/agentica/publication';
import { readCanonical, snapshotOf } from '../../src/persistence/canonical/read';
import { executeCanonical } from '../../src/persistence/canonical/transaction';
import { observeMaze } from '../../src/services/agentica/game/observation';
import type { ProtocolRef } from '../../src/persistence/canonical/agentica/types';

export async function newPublication() {
  const f = window.canonicalAgenticaOperations, s = await f.boot();
  await f.confirm(s.action, s.binding, s.entry); await f.advance(s.action);
  await f.cancel(s.operationId);
  const request = await f.command('agentica.publish', {});
  let publication: ProtocolRef | undefined;
  await executeCanonical(request, async tx => {
    const saved = await retainPublication(tx, request); publication = saved.reference; return saved.receipt;
  });
  if (!publication) throw Error('Missing new publication');
  const binding = { grant: s.binding.grant, publication }, signal = new AbortController().signal;
  const port: CanonicalHostPort = { hostSignal: signal, async submitHostCommand(command) {
    const input = command.kind === 'retry' ? command.request : await f.command(command.operation, command.input);
    return (await command.execute(input, { signal })).receipt;
  } };
  const current = (await f.readCanonicalHead()).head;
  const observation = (await readCanonical(pages => observeMaze(pages, snapshotOf(current), publication!))).value;
  const action = { ...s.action, actionId: crypto.randomUUID(), runnerRunId: crypto.randomUUID(), stepId: crypto.randomUUID(),
    expectedRevision: observation.revision };
  const hooks = createGameActionHooks(port, binding);
  await hooks.saveAction!(actionKey(action), { fingerprint: actionFingerprint(action), status: 'pending' });
  const admission = await hooks.onAction!(action);
  if (!admission.operation) throw Error(`Fresh admission failed: ${JSON.stringify(admission)}`);
  const entry = { ...s.entry, action, admission };
  const before = await f.dump();
  const confirmation = await f.confirm(action, binding, entry).then(() => 'accepted', String);
  return { oldPublication: s.binding.publication, publication, admission: admission.disposition,
    operation: admission.operation.operationId, confirmation, unchanged: before === await f.dump() };
}

export async function predecessor(damage: 'receipt' | 'body') {
  const f = window.canonicalAgenticaOperations, s = await f.boot(); await f.confirm(s.action, s.binding, s.entry);
  const first = await f.advance(s.action); await f.ack(s.action, { ...s.entry, latestEvent: first.state!.event!.data.event });
  const second = await f.advance(s.action); await f.ack(s.action, { ...s.entry, latestEvent: second.state!.event!.data.event });
  const head = (await f.readCanonicalHead()).head, db = await f.openCanonicalDatabase();
  const ref = first.state!.event!.reference, row = (await db.get('records', [head.gameId, ref.id]))!;
  if (damage === 'receipt') await db.delete('receipts', [head.gameId, first.request.attemptId]);
  else {
    const value = row.value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Expected event object');
    value.schema = 99; await db.put('records', row, [head.gameId, row.id]);
  }
  db.close(); const before = await f.dump();
  const read = await f.read(s.action).then(() => 'accepted', String);
  const advance = await f.advance(s.action).then(r => ({ accepted: true, steps: r.state!.progress.steps }), error => ({ accepted: false, error: String(error) }));
  return { damage, read, advance, unchanged: before === await f.dump() };
}

export async function changedActiveEpoch() {
  const f = window.canonicalAgenticaOperations, s = await f.boot(); await f.confirm(s.action, s.binding, s.entry);
  const first = await f.advance(s.action), before = await f.dump();
  const result = await f.ack(s.action, { ...s.entry, activeEpoch: 'foreign', latestEvent: first.state!.event!.data.event }).then(() => 'accepted', String);
  return { result, unchanged: before === await f.dump() };
}
