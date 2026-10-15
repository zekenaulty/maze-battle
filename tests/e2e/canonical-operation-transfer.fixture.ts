import { AgenticaHost, type AgenticaOperationEntry } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { createGameOperationDriver } from '../../src/services/agentica/game/operationDriver';
import { createGameOperationTransfer } from '../../src/services/agentica/game/operationTransfer';
import { prepareAction } from '../../src/persistence/canonical/agentica/actions';
import { readAgenticaOperation, operationProgressHooks } from '../../src/persistence/canonical/agentica/operation';
import { retainPublication } from '../../src/persistence/canonical/agentica/publication';
import { loadTransfer, loadTransferAck, transferStageKey } from '../../src/persistence/canonical/agentica/transfer.records';
import { retainTransferAuthority } from '../../src/persistence/canonical/agentica/transfer';
import { loadOperationConfirmation } from '../../src/persistence/canonical/agentica/operation.confirmation';
import { readAgenticaTerminal } from '../../src/persistence/canonical/agentica/terminal';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { canonicalFence, executeCanonical, operateCanonical } from '../../src/persistence/canonical/transaction';
import { executeNavigationCommand } from '../../src/persistence/canonical/navigation/commands';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import type { ProtocolRef } from '../../src/persistence/canonical/agentica/types';
import type { CanonicalHostPort, CanonicalHostCommand } from '../../src/services/game/CanonicalHostCommand';
import { json } from '../../src/persistence/canonical/world/records';
import { seedTransfer, type TransferSeed } from './canonical-operation-transfer.setup';
import { startGame } from './canonical-agentica-actions.setup';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5258') throw Error('Isolated transfer fixture origin required');
let session: Awaited<ReturnType<typeof startGame>>, seed: TransferSeed;
let driver: Awaited<ReturnType<typeof createGameOperationDriver>>, transfer: Awaited<ReturnType<typeof createGameOperationTransfer>>;
let lostKernelReply = false;
const forbidden = async () => { throw Error('Transfer must not execute cognition or actions'); };
const sdk = new AgenticaHost({ url: 'ws://127.0.0.1:5258/api/host', onAction: forbidden, loadAction: forbidden, saveAction: forbidden });
async function attach() {
  driver = await createGameOperationDriver(session, sdk, seed.action, seed.binding);
  const port: CanonicalHostPort = { get hostSignal() { return session.hostSignal; }, async submitHostCommand(command: CanonicalHostCommand) {
    const result = await session.submitHostCommand(command);
    if (lostKernelReply && command.kind === 'retry' && command.request.operation === 'operation.adopt') {
      lostKernelReply = false; throw Error('Fixture lost committed kernel adoption reply');
    }
    return result;
  } };
  transfer = await createGameOperationTransfer(port, sdk, seed.action, seed.binding);
}
function stop() { transfer?.close(); driver?.close(); session?.stop(); }
async function resume(original: TransferSeed) { seed = structuredClone(original); session = await startGame(); await attach(); return (await readCanonicalHead()).head; }
async function boot() { const started = await seedTransfer(); session = started.session; seed = started.seed; await attach(); return seed; }
async function publish() {
  const receipt = await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.publish', input: {},
    execute: (request, options) => executeCanonical(request, async tx => (await retainPublication(tx, request)).receipt, options) });
  return (receipt.result as unknown as { reference: ProtocolRef }).reference;
}
async function state() {
  const identity = await prepareAction(seed.action), operation = await readAgenticaOperation(identity);
  const retained = await readCanonical(async p => {
    const c = await loadOperationConfirmation(p, identity); if (!c) return null;
    const intent = await loadTransfer(p, identity, c); if (!intent) return null;
    const ack = await loadTransferAck(p, identity, c, intent);
    const authority = await p.get('execution', transferStageKey(intent.reference, 'authority'));
    return { intent, ack, authority };
  });
  return { ...operation, retained: retained.value };
}
async function genericAdopt() {
  for (const id of [seed.launchGuard, seed.operationId]) await session.submitHostCommand({ kind: 'fresh', operation: 'operation.adopt',
    input: { operationId: id }, execute: (request, options) => operateCanonical(request, 'adopt', undefined, options) });
}
async function advanceDirect() {
  const identity = await prepareAction(seed.action), s = await readAgenticaOperation(identity);
  return executeNavigationCommand({ attemptId: crypto.randomUUID(), expected: canonicalFence(s.head), deadlineAt: null,
    operation: 'navigation.advance', input: { operationId: seed.operationId, sequence: s.value!.progress.sequence } },
  { host: operationProgressHooks(identity, s.value!.confirmation.reference) });
}
async function authorize() {
  const identity = await prepareAction(seed.action), intent = (await state()).retained!.intent.reference;
  return session.submitHostCommand({ kind: 'fresh', operation: 'agentica.operation.transfer-authorize', input: json({ action: identity.storageKey, intent }),
    execute: (request, options) => executeCanonical(request, async tx => (await retainTransferAuthority(tx, request, identity, intent)).receipt, options) });
}
async function quota() {
  const db = await openCanonicalDatabase();
  try {
    const head = (await readCanonicalHead()).head;
    head.quota.limitBytes = head.quota.usedBytes + head.quota.reserveBytes + head.quota.reservedBytes;
    await db.put('heads', head, head.gameId);
  } finally { db.close(); }
  return publish().catch(String);
}
async function corruptAdoptionReceipt(kind: 'guard' | 'navigation') {
  const s = await state(), id = `${s.retained!.intent.reference.id}:${kind}`, db = await openCanonicalDatabase();
  try { const row = (await db.get('receipts', [s.head.gameId, id]))!; row.result = { operationId: 'foreign', phase: 'adopt' };
    await db.put('receipts', row, [s.head.gameId, id]); } finally { db.close(); }
}
const api = { boot, resume, stop, publish, state, genericAdopt, authorize, quota, corruptAdoptionReceipt, advanceDirect,
  changeCheckpoint: () => session.execute('settings', { kind: 'throttle', ms: 123 }),
  prepare: async () => transfer.prepare(await publish()), transferPulse: () => transfer.pulse(), pulse: () => driver.pulse(),
  loseKernelReply: () => { lostKernelReply = true; }, cancel: () => driver.cancel(),
  terminal: async () => (await readAgenticaTerminal(await prepareAction(seed.action), seed.binding)).value,
};
declare global { interface Window { canonicalOperationTransfer: typeof api } }
window.canonicalOperationTransfer = api;
export type { AgenticaOperationEntry };
