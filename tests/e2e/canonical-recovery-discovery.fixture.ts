import { listAgenticaRecovery, inspectAgenticaRecovery, type RecoveryCandidate } from '../../src/persistence/canonical/agentica/recovery';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { CanonicalPages } from '../../src/persistence/canonical/pages';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { MIN_TERMINAL_BYTES, type OwnerFence } from '../../src/persistence/canonical/types';
import { operateCanonical } from '../../src/persistence/canonical/transaction';
import { publishGamePublication } from '../../src/services/agentica/game/publication';
import { createGameActionHooks } from '../../src/services/agentica/game/actionHooks';
import { actionKey, actionFingerprint } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { seedRecovery, nextRecoveryWindow, type Scenario } from './canonical-recovery-discovery.setup';
import { dump, fillQuota } from './canonical-decision-ack.storage';
import { startGame } from './canonical-agentica-actions.setup';
import { unchangedSchema, inventoryRace } from './canonical-recovery-discovery.schema';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5270') throw Error('Isolated recovery discovery fixture only');
let context: Awaited<ReturnType<typeof seedRecovery>> | undefined;
async function audit<T>(work: () => Promise<T>) {
  const before = await dump(), modes: string[] = [], keys: string[] = [];
  const transaction = IDBDatabase.prototype.transaction, scan = CanonicalPages.prototype.scan, get = CanonicalPages.prototype.get;
  IDBDatabase.prototype.transaction = function (...args: Parameters<typeof transaction>) {
    modes.push(args[1] ?? 'readonly'); return transaction.apply(this, args);
  };
  CanonicalPages.prototype.scan = async () => { throw Error('Recovery scanned history'); };
  CanonicalPages.prototype.get = function (...args: Parameters<typeof get>) { keys.push(args[1]); return get.apply(this, args); };
  let value: T | undefined, error: string | undefined;
  try { value = await work(); } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
  finally { IDBDatabase.prototype.transaction = transaction; CanonicalPages.prototype.scan = scan; CanonicalPages.prototype.get = get; }
  return { value, error, unchanged: before === await dump(), modes, keys };
}
async function corrupt(candidate: RecoveryCandidate, kind: 'reserve' | 'original' | 'changed-original' | 'ack' | 'selection') {
  const view = await readCanonical(p => p.get('execution', candidate.original.key)), db = await openCanonicalDatabase();
  try {
    if (kind === 'original') await db.delete('records', [view.head.gameId, candidate.original.id]);
    else if (kind === 'changed-original') await db.put('records', { ...view.value!, value: { invalid: true } }, [view.head.gameId, candidate.original.id]);
    else {
      let attempt = (view.value!.value as { sourceAttemptId: string }).sourceAttemptId;
      if (kind === 'ack') attempt = (await db.get('operations', [view.head.gameId, candidate.operationId]))!.acknowledgementAttemptId!;
      if (kind === 'selection') {
        const inventory = await listAgenticaRecovery();
        const row = await db.get('records', [view.head.gameId, inventory.selected!.reference.id]);
        attempt = (row!.value as { sourceAttemptId: string }).sourceAttemptId;
      }
      await db.delete('receipts', [view.head.gameId, attempt]);
    }
  } finally { db.close(); }
}
const api = {
  unchangedSchema, inventoryRace,
  async boot(scenario: Scenario = 'navigation') { context = await seedRecovery(scenario); return context.seed; },
  async nextWindow() { context!.seed = await nextRecoveryWindow(context!.session, context!.seed!); },
  list: () => audit(() => listAgenticaRecovery()),
  inspect: (expected: OwnerFence, candidate: RecoveryCandidate) => audit(() => inspectAgenticaRecovery(expected, candidate)),
  async inspectCaptured(expected: OwnerFence, candidate: RecoveryCandidate) {
    return audit(async () => {
      const result = inspectAgenticaRecovery(expected, candidate);
      expected.owner = 'mutated'; candidate.binding.grant.id = 'mutated'; candidate.original.id = 'mutated'; return result;
    });
  },
  async fillAllocations() {
    const count = Object.keys((await readCanonicalHead()).head.allocations).length;
    for (let i = count; i < 16; i++) await context!.session.submitHostCommand({ kind: 'fresh', operation: 'operation.admit',
      input: { operationId: `fixture-${i}`, binding: { kind: 'fixture' }, terminalBytes: MIN_TERMINAL_BYTES },
      execute: (request, options) => operateCanonical(request, 'admit', async () => ({}), options) });
  },
  async reserveOnly() {
    const launch = (await readLaunch()).value!, run = launch.run!.value.data.started;
    const binding = { grant: launch.grant!.ref, publication: launch.binding.publication };
    const action = { ...run, actionId: crypto.randomUUID(), runnerRunId: crypto.randomUUID(), stepId: crypto.randomUUID(),
      capabilityId: 'maze.observe', arguments: {}, expectedRevision: launch.publication.wireRevision, deadlineAt: new Date(Date.now() + 300000).toISOString() };
    const { hostId: _host, scopeId: _scope, objectiveId: _objective, ...input } = action;
    await createGameActionHooks(context!.session, binding).saveAction!(actionKey(input), { fingerprint: actionFingerprint(input), status: 'pending' });
  },
  changeHead: () => publishGamePublication(context!.session),
  async takeover() { context!.session.stop(); context!.session = await startGame(); },
  quota: fillQuota, corrupt, dump, stop: () => context?.session.stop(),
};
declare global { interface Window { canonicalRecoveryDiscovery: typeof api } }
window.canonicalRecoveryDiscovery = api;
window.addEventListener('pagehide', () => api.stop());
