import { GameSession } from '../../src/services/game/GameSession';
import { executeCanonical } from '../../src/persistence/canonical/transaction';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { retainPublication, readPublication } from '../../src/persistence/canonical/agentica/publication';
import { executeNavigationCommand, createDestinationBinding, readDestination } from '../../src/persistence/canonical/navigation/commands';
import { MIN_TERMINAL_BYTES } from '../../src/persistence/canonical/types';
import type { CanonicalRequest, JsonObject } from '../../src/persistence/canonical/types';
import type { ProtocolRef } from '../../src/persistence/canonical/agentica/types';
import { json } from '../../src/persistence/canonical/world/records';
import { gameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';

const session = new GameSession(() => {});
let original: CanonicalRequest | undefined;
const publication = (request: CanonicalRequest, options: { signal: AbortSignal }) => {
  original = structuredClone(request);
  return executeCanonical(request, async tx => (await retainPublication(tx, request)).receipt, options);
};
const publish = () => session.submitHostCommand({ kind: 'fresh', operation: 'agentica.publication', input: {}, execute: publication });
const view = () => ({ status: session.view.status, controlled: session.view.controlled, recoveryRequired: session.view.recoveryRequired,
  revision: session.view.game?.snapshot.revision, generation: session.view.game?.snapshot.generation });

export async function queueRoundTrip() {
  await session.start();
  const initial = (await readCanonicalHead()).head;
  const receipts = await Promise.all([publish(), session.execute('exploration', { kind: 'look' }), publish()]);
  const proofs = [];
  for (const receipt of [receipts[0], receipts[2]]) {
    const ref = (receipt.result as JsonObject).reference as unknown as ProtocolRef;
    proofs.push((await readCanonical(pages => readPublication(pages, ref))).value.wireRevision);
  }
  const final = (await readCanonicalHead()).head;
  return { initial: initial.revision, final: final.revision, receipts: receipts.map(r => r.afterRevision), proofs, view: view() };
}

export async function exactReplay() {
  await session.start();
  const receipt = await publish(), request = structuredClone(original!);
  await session.execute('exploration', { kind: 'look' });
  const before = (await readCanonicalHead()).head;
  let effects = 0;
  const retried = await session.submitHostCommand({ kind: 'retry', request,
    execute: (r, options) => executeCanonical(r, async () => { effects++; throw Error('Replay invoked effect'); }, options) });
  return { identical: JSON.stringify(receipt) === JSON.stringify(retried), effects,
    unchanged: JSON.stringify(before) === JSON.stringify((await readCanonicalHead()).head), view: view(), revision: before.revision };
}

export async function captureInput() {
  await session.start();
  const input = { value: { count: 1 } };
  const pending = session.submitHostCommand({ kind: 'fresh', operation: 'agentica.capture', input,
    execute: (r, options) => executeCanonical(r, async () => r.input, options) });
  input.value.count = 99;
  return (await pending).result;
}

export async function navigation() {
  await session.start();
  const start = gameCheckpoint((await readCanonicalHead()).head.checkpoint).position;
  const operationId = crypto.randomUUID();
  const binding = createDestinationBinding({ ...start, cell: { ...start.cell, row: start.cell.row + 1 } });
  await session.submitHostCommand({ kind: 'fresh', operation: 'operation.admit',
    input: { operationId, binding: json(binding), terminalBytes: MIN_TERMINAL_BYTES }, execute: executeNavigationCommand });
  const admitted = (await readDestination(operationId)).value.progress;
  await session.submitHostCommand({ kind: 'fresh', operation: 'navigation.advance',
    input: { operationId, sequence: 0 }, execute: executeNavigationCommand });
  const progress = (await readDestination(operationId)).value.progress;
  return { start, admitted, progress, position: session.view.game?.checkpoint.position };
}

/** Abort after staged records reached IDB but before the head commit. No timers inside transaction work. */
export async function stopDuringCommit(kind: 'host' | 'settings' | 'save' | 'look') {
  await session.start();
  const before = (await readCanonicalHead()).head, put = IDBObjectStore.prototype.put;
  let aborted = false;
  IDBObjectStore.prototype.put = function(...args) {
    if (this.transaction.db.name === 'maze-battle' && this.name === 'heads' && !aborted) {
      aborted = true; session.stop('Fixture Stop');
    }
    return Reflect.apply(put, this, args);
  };
  try {
    const first = kind === 'host' ? publish() : kind === 'settings' ? session.execute('settings', { kind: 'throttle', ms: 100 })
      : kind === 'save' ? session.createManualSave() : session.execute('exploration', { kind: 'look' });
    const pending = Promise.allSettled([first, publish()]);
    const outcomes = await pending; await session.flush();
    return { aborted, outcomes: outcomes.map(r => r.status), view: view(),
      unchanged: JSON.stringify(before) === JSON.stringify((await readCanonicalHead()).head) };
  } finally { IDBObjectStore.prototype.put = put; }
}

export async function failClosed() {
  await session.start();
  const before = (await readCanonicalHead()).head;
  const failure = session.submitHostCommand({ kind: 'fresh', operation: 'agentica.failure', input: {},
    execute: (r, options) => executeCanonical(r, async tx => {
      await tx.pages.set('execution', 'fixture/must-rollback', { value: true }); throw Error('Unusable host proof');
    }, options) });
  const outcomes = await Promise.allSettled([failure, publish()]); await session.flush();
  const failedView = view(); await session.takeControl();
  return { outcomes: outcomes.map(r => r.status), failedView, recovered: view(),
    before: before.revision, after: (await readCanonicalHead()).head.revision,
    row: (await readCanonical(pages => pages.get('execution', 'fixture/must-rollback'))).value ?? null };
}

Object.assign(window, { gameHostFixture: { queueRoundTrip, exactReplay, captureInput, navigation, stopDuringCommit, failClosed } });
