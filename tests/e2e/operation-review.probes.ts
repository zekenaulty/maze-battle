import type {} from './canonical-agentica-operations.fixture';
import { createGameActionHooks } from '../../src/services/agentica/game/actionHooks';
import type { CanonicalHostPort } from '../../src/services/game/CanonicalHostCommand';
import { actionFingerprint, actionKey } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { retainPublication } from '../../src/persistence/canonical/agentica/publication';
import { readCanonical, snapshotOf } from '../../src/persistence/canonical/read';
import { executeCanonical } from '../../src/persistence/canonical/transaction';
import { observeMaze } from '../../src/services/agentica/game/observation';
import type { ProtocolRef } from '../../src/persistence/canonical/agentica/types';
import { loadAgenticaOperation } from '../../src/persistence/canonical/agentica/operation';

export async function newPublication() {
  const f = window.canonicalAgenticaOperations, s = await f.boot();
  await f.confirm(s.action, s.binding, s.entry); await f.acceptCustody(s.action, s.entry); await f.advance(s.action);
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
  const wrongPublication = await f.confirm(action, { ...binding, publication: s.binding.publication }, entry).then(() => 'accepted', String);
  const wrongUnchanged = before === await f.dump();
  const confirmation = await f.confirm(action, binding, entry).then(() => 'accepted', String);
  const retained = (await f.read(action)).value;
  if (retained) await f.acceptCustody(action, entry);
  const moved = retained ? (await f.advance(action)).state : null;
  return { oldPublication: s.binding.publication, publication, admission: admission.disposition,
    operation: admission.operation.operationId, confirmation, wrongPublication, wrongUnchanged,
    retainedPublication: retained?.confirmation.data.binding.publication, startObservation: retained?.confirmation.data.entry.request.observation.observationId,
    steps: moved?.progress.steps };
}

export async function predecessor(damage: 'receipt' | 'body' | 'record' | 'witness' | 'source') {
  const f = window.canonicalAgenticaOperations, s = await f.boot(); await f.confirm(s.action, s.binding, s.entry);
  await f.acceptCustody(s.action, s.entry);
  const first = await f.advance(s.action); await f.ack(s.action, { ...s.entry, latestEvent: first.state!.event!.data.event });
  const second = await f.advance(s.action); await f.ack(s.action, { ...s.entry, latestEvent: second.state!.event!.data.event });
  const head = (await f.readCanonicalHead()).head, db = await f.openCanonicalDatabase();
  const ref = first.state!.event!.reference, row = (await db.get('records', [head.gameId, ref.id]))!;
  if (damage === 'receipt') await db.delete('receipts', [head.gameId, first.request.attemptId]);
  else if (damage === 'record') await db.delete('records', [head.gameId, ref.id]);
  else if (damage === 'body') {
    const value = row.value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Expected event object');
    value.schema = 99; await db.put('records', row, [head.gameId, row.id]);
  } else {
    const receipt = (await db.get('receipts', [head.gameId, first.request.attemptId]))!;
    if (damage === 'source') {
      const source = JSON.parse(receipt.fingerprint); source.input.sequence = 999; receipt.fingerprint = f.fingerprint(source);
    } else {
      const result = receipt.result as { host: { event: { recordWitness: string } } }; result.host.event.recordWitness = 'changed';
    }
    await db.put('receipts', receipt, [head.gameId, receipt.attemptId]);
  }
  db.close(); const before = await f.dump();
  const read = await f.read(s.action).then(() => 'accepted', String);
  const identity = await f.prepareAction(s.action), request = await f.command('navigation.advance', { operationId: s.operationId, sequence: 2 });
  const advance = await f.executeNavigationCommand(request, { host: f.operationProgressHooks(identity, first.state!.confirmation.reference) })
    .then(() => ({ accepted: true }), error => ({ accepted: false, error: String(error) }));
  return { damage, read, advance, unchanged: before === await f.dump() };
}

export async function boundedPredecessor() {
  const f = window.canonicalAgenticaOperations, s = await f.boot(); await f.confirm(s.action, s.binding, s.entry);
  await f.acceptCustody(s.action, s.entry);
  for (let i = 0; i < 3; i++) {
    const step = await f.advance(s.action); await f.ack(s.action, { ...s.entry, latestEvent: step.state!.event!.data.event });
  }
  const identity = await f.prepareAction(s.action), calls: string[] = [];
  const result = await readCanonical(pages => loadAgenticaOperation({ ...pages, get: (area, key) => {
    if (key.includes('/events/')) calls.push(key); return pages.get(area, key);
  } }, identity));
  return { calls, expected: [f.eventKey(identity, 3), f.eventKey(identity, 2)], sequence: result.value!.progress.sequence, stats: result.stats };
}

export async function changedActiveEpoch() {
  const f = window.canonicalAgenticaOperations, s = await f.boot(); await f.confirm(s.action, s.binding, s.entry);
  await f.acceptCustody(s.action, s.entry);
  const first = await f.advance(s.action), before = await f.dump();
  const result = await f.ack(s.action, { ...s.entry, activeEpoch: 'foreign', latestEvent: first.state!.event!.data.event }).then(() => 'accepted', String);
  return { result, unchanged: before === await f.dump() };
}
