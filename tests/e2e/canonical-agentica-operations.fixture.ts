import type { AgenticaAction } from '../../src/services/agentica/contracts';
import { AgenticaHost, actionFingerprint, actionKey, type HostOperationEvent, type AgenticaOperationEntry } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { createGameActionHooks } from '../../src/services/agentica/game/actionHooks';
import { createGameOperationDriver } from '../../src/services/agentica/game/operationDriver';
import { flatAddress } from '../../src/services/agentica/game/validation';
import { prepareAction } from '../../src/persistence/canonical/agentica/actions';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { readAgenticaOperation, retainOperationConfirmation, retainOperationCustodyAck, operationProgressHooks, retainEventAcknowledgement } from '../../src/persistence/canonical/agentica/operation';
import { operationKey } from '../../src/persistence/canonical/agentica/operation.records';
import { eventKey } from '../../src/persistence/canonical/agentica/event.records';
import type { ProtocolRef } from '../../src/persistence/canonical/agentica/types';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { executeCanonical, operateCanonical, canonicalFence } from '../../src/persistence/canonical/transaction';
import { executeNavigationCommand } from '../../src/persistence/canonical/navigation/commands';
import type { NavigationHostHooks } from '../../src/persistence/canonical/navigation/host';
import type { CanonicalRequest } from '../../src/persistence/canonical/types';
import { CANONICAL_STORES } from '../../src/persistence/canonical/types';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { json, same } from '../../src/persistence/canonical/world/records';
import { fingerprint } from '../../src/persistence/canonical/validation';
import { bytes, fundLaunch, startGame } from './canonical-agentica-actions.setup';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5242') throw Error('Isolated operation fixture origin required');
let session: Awaited<ReturnType<typeof startGame>> | undefined;
let driver: Awaited<ReturnType<typeof createGameOperationDriver>> | undefined;
async function attachDriver(action: AgenticaAction, binding: Awaited<ReturnType<typeof boot>>['binding']) {
  const forbidden = async () => { throw Error('Operation delivery cannot invoke cognition or host actions'); };
  const sdk = new AgenticaHost({ url: 'ws://127.0.0.1:5242/api/host', onAction: forbidden, loadAction: forbidden, saveAction: forbidden,
    maxActions: 512 });
  driver = await createGameOperationDriver(session!, sdk, action, binding);
}
async function boot() {
  session = await startGame(); const funded = await fundLaunch(session), launch = (await readLaunch()).value!;
  const sight = session.view.game!.observation!, actor = session.view.game!.checkpoint.position;
  const queue = [{ at: actor, depth: 0 }], visited = new Set([JSON.stringify(actor)]);
  for (let i = 0; i < queue.length; i++) {
    const next = queue[i]; if (next.depth >= 3) break;
    const cell = sight.cells.find(c => same(c.at, next.at));
    for (const at of Object.values(cell?.edges ?? {})) if (at && !visited.has(JSON.stringify(at))) {
      visited.add(JSON.stringify(at)); queue.push({ at, depth: next.depth + 1 });
    }
  }
  const target = queue.find(q => q.depth === 3)?.at; if (!target) throw Error('Need earned three-edge destination');
  const run = launch.run!.value.data.started, binding = { grant: launch.grant!.ref, publication: funded.publication };
  const action: AgenticaAction = { actionId: crypto.randomUUID(), runnerRunId: crypto.randomUUID(), stepId: crypto.randomUUID(),
    runId: run.runId, sessionId: run.sessionId, sessionEpoch: run.sessionEpoch, manifestHash: run.manifestHash,
    capabilityId: 'maze.navigate', arguments: { ...flatAddress(target) }, expectedRevision: launch.publication.wireRevision,
    deadlineAt: new Date(Date.now() + 300_000).toISOString() };
  const hooks = createGameActionHooks(session, binding);
  await hooks.saveAction!(actionKey(action), { fingerprint: actionFingerprint(action), status: 'pending' });
  const admission = await hooks.onAction!(action);
  if (!admission.operation) throw Error(JSON.stringify(admission));
  const entry: AgenticaOperationEntry = { request: funded.start, action, admission, activeEpoch: action.sessionEpoch,
    state: 'parked', usage: { steps: 1, refinements: 0, continuations: 0, providerCalls: 1 } };
  return { action, binding, entry, operationId: admission.operation.operationId, launchGuard: launch.guard.id, target, actor };
}
async function command(operation: string, input: unknown): Promise<CanonicalRequest> {
  return { attemptId: crypto.randomUUID(), expected: canonicalFence((await readCanonicalHead()).head), operation, input: json(input), deadlineAt: null };
}
async function confirm(action: AgenticaAction, binding: Awaited<ReturnType<typeof boot>>['binding'], entry: AgenticaOperationEntry, retry?: CanonicalRequest) {
  const identity = await prepareAction(action), request = retry ?? await command('agentica.operation.confirm', { action: identity.storageKey, binding, entry });
  const outcome = await executeCanonical(request, async tx => (await retainOperationConfirmation(tx, request, identity, binding, entry)).receipt);
  return { request, outcome, state: (await readAgenticaOperation(identity)).value };
}
async function advance(action: AgenticaAction, ref?: ProtocolRef, retry?: CanonicalRequest, wrap?: (hooks: NavigationHostHooks) => NavigationHostHooks) {
  const identity = await prepareAction(action), state = ref ? null : (await readAgenticaOperation(identity)).value!;
  const confirmation = ref ?? state!.confirmation.reference;
  const operationId = state?.progress.operationId ?? (await readCanonical(async p => {
    const row = await p.get('execution', confirmation.key); return (row?.value as unknown as { data: { operationId: string } }).data.operationId;
  })).value;
  const request = retry ?? await command('navigation.advance', { operationId, sequence: state?.progress.sequence ?? 0 });
  const host = operationProgressHooks(identity, confirmation);
  const outcome = await executeNavigationCommand(request, { host: wrap ? wrap(host) : host });
  return { request, outcome, state: (await readAgenticaOperation(identity)).value };
}
async function custodyAck(action: AgenticaAction, entry: AgenticaOperationEntry, ref?: ProtocolRef, retry?: CanonicalRequest) {
  const identity = await prepareAction(action), confirmation = ref ?? (await readAgenticaOperation(identity)).value!.confirmation.reference;
  const request = retry ?? await command('agentica.operation.custody', { action: identity.storageKey, confirmation, entry });
  const outcome = await executeCanonical(request, async tx => (await retainOperationCustodyAck(tx, request, identity, confirmation, entry)).receipt);
  return { request, outcome, state: (await readAgenticaOperation(identity)).value };
}
// Explicit in-memory service acceptance for core tests, never automatic in confirm or advance.
async function acceptCustody(action: AgenticaAction, entry: AgenticaOperationEntry) {
  const confirmed = (await readAgenticaOperation(await prepareAction(action))).value!;
  const remote = await sdkProof(entry, confirmed.confirmation.data.probe);
  return custodyAck(action, remote.result, confirmed.confirmation.reference);
}
async function ack(action: AgenticaAction, entry: AgenticaOperationEntry, ref?: ProtocolRef, retry?: CanonicalRequest) {
  const identity = await prepareAction(action), event = ref ?? (await readAgenticaOperation(identity)).value!.event!.reference;
  const request = retry ?? await command('agentica.operation.ack', { action: identity.storageKey, event, entry });
  const outcome = await executeCanonical(request, async tx => (await retainEventAcknowledgement(tx, request, identity, event, entry)).receipt);
  return { request, outcome, state: (await readAgenticaOperation(identity)).value };
}
async function dump() {
  const db = await openCanonicalDatabase(), tx = db.transaction(CANONICAL_STORES, 'readonly'), result: unknown[] = [];
  try { for (const name of CANONICAL_STORES) result.push([name, await tx.objectStore(name).getAllKeys(), await tx.objectStore(name).getAll()]);
    await tx.done; return JSON.stringify(result); } finally { db.close(); }
}
async function sdkProof(entry: AgenticaOperationEntry, event: HostOperationEvent, status = 200) {
  const forbidden = async () => { throw Error('No actions during validation'); };
  const host = new AgenticaHost({ url: 'ws://127.0.0.1:5242/offline-only', onAction: forbidden, loadAction: forbidden, saveAction: forbidden });
  const checked = (host as unknown as { _operationEntry(e: AgenticaOperationEntry, h: string, s: string): AgenticaOperationEntry })
    ._operationEntry(entry, entry.request.hostId, entry.request.sessionId);
  let sent: unknown;
  // SDK validation and serialization only: this in-memory function cannot access a network.
  const result = await host.signalOperation(event, { fetchImpl: async (_url, options) => {
    sent = JSON.parse(options!.body as string); return new Response(JSON.stringify(status === 200 ? { ...entry, latestEvent: sent }
      : { code: 'operation.admission_unsettled', message: 'Original action custody is unresolved.' }), { status });
  } });
  return { checked, sent, result };
}
const api = { boot, command, confirm, custodyAck, acceptCustody, advance, ack, dump, bytes, prepareAction, operationKey, eventKey, readCanonical, readCanonicalHead, sdkProof, fingerprint,
  executeCanonical, operateCanonical, executeNavigationCommand, retainOperationConfirmation, retainOperationCustodyAck, retainEventAcknowledgement, operationProgressHooks,
  attachDriver, pulseDriver: () => driver!.pulse(), closeDriver: () => driver!.close(),
  driverStatus: () => ({ controlled: session!.view.controlled, recoveryRequired: session!.view.recoveryRequired }),
  openCanonicalDatabase, readAgenticaOperation,
  async read(action: AgenticaAction) { return readAgenticaOperation(await prepareAction(action)); },
  async cancel(id: string) { return operateCanonical(await command('operation.cancel', { operationId: id }), 'cancel'); },
  async resume() { session = await startGame(); return (await readCanonicalHead()).head; },
  stop() { driver?.close(); session?.stop(); },
};
declare global { interface Window { canonicalAgenticaOperations: typeof api } }
window.canonicalAgenticaOperations = api;
