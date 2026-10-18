import { seedPregrantProof, type ProofSeed, type SeedOptions } from './canonical-pregrant-proof.setup';
import { fundLaunch } from './canonical-agentica-actions.setup';
import { prepareAction } from '../../src/persistence/canonical/agentica/actions';
import { retainDecisionClaim, loadDecisionClaim } from '../../src/persistence/canonical/agentica/decision.claim';
import { loadDecisionIntent } from '../../src/persistence/canonical/agentica/decision.records';
import { claimedParentKey } from '../../src/persistence/canonical/agentica/decision.claim.locator';
import { terminalAcknowledgement } from '../../src/persistence/canonical/agentica/terminal.ack';
import { CanonicalPages } from '../../src/persistence/canonical/pages';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { readCanonical } from '../../src/persistence/canonical/read';
import { executeCanonical } from '../../src/persistence/canonical/transaction';
import { json } from '../../src/persistence/canonical/world/records';
import { fields } from '../../src/persistence/canonical/roster/codec';
import type { GameSession } from '../../src/services/game/GameSession';
import type { AgenticaAction } from '../../src/services/agentica/contracts';
import { canonicalJson } from '../../src/services/agentica/sdk/agentica-host.mjs';
let state: ProofSeed | undefined;

export async function replayRecoveryClaim(session: GameSession, action: AgenticaAction) {
  const identity = await prepareAction(action), claim = (await readCanonical(p => loadDecisionClaim(p, identity))).value!;
  const entry = fields(claim.source.input, 'action intent started entry').entry as unknown as ProofSeed['entry'];
  return session.submitHostCommand({ kind: 'fresh', operation: 'agentica.operation.decision-claim', input: claim.source.input,
    execute: (r, options) => executeCanonical(r, async tx => (await retainDecisionClaim(tx, r, identity,
      claim.data.intent, claim.data.started, entry)).receipt, options) });
}
async function claim() {
  const s = state!, intent = (await readCanonical(p => loadDecisionIntent(p, s.identity))).value!;
  return s.session.submitHostCommand({ kind: 'fresh', operation: 'agentica.operation.decision-claim',
    input: json({ action: s.identity.storageKey, intent: intent.reference, started: s.started, entry: s.entry }),
    execute: (r, options) => executeCanonical(r, async tx => (await retainDecisionClaim(tx, r, s.identity,
      intent.reference, s.started, s.entry)).receipt, options) });
}
async function locator() {
  const s = state!, root = (await s.root.state()).launch.binding.launchId;
  return (await readCanonical(p => p.get('execution', claimedParentKey(root)))).value!;
}
type Damage = 'root' | 'source' | 'revision' | 'original' | 'binding' | 'claim' | 'claim-source' | 'root-source'
  | 'missing-witness' | 'witness-key' | 'witness-id' | 'witness-content' | 'claim-witness' | 'claim-format';
async function corrupt(kind: Damage) {
  const s = state!, pointer = await locator(), value = pointer.value as Record<string, unknown>;
  const claim = (await readCanonical(p => loadDecisionClaim(p, s.identity))).value!, db = await openCanonicalDatabase();
  try {
    if (kind === 'claim-source' || kind === 'root-source') {
      const attempt = kind === 'claim-source' ? claim.source.attemptId : (await s.root.state()).launch.guard.admissionAttemptId;
      await db.delete('receipts', [pointer.gameId, attempt]); return;
    }
    if (kind === 'claim') { await db.delete('records', [pointer.gameId, claim.reference.id]); return; }
    if (['missing-witness', 'witness-key', 'witness-id', 'witness-content', 'claim-witness', 'claim-format'].includes(kind)) {
      const receipt = claim.receipt, result = fields(receipt.result, 'agenticaOperation claimedParent');
      const witness = fields(result.claimedParent, 'key id recordWitness');
      if (kind === 'missing-witness') delete result.claimedParent;
      if (kind === 'witness-key') witness.key = 'agentica/claimed-parents/foreign';
      if (kind === 'witness-id') witness.id = 'foreign';
      if (kind === 'witness-content') witness.recordWitness = '{}';
      const operation = fields(result.agenticaOperation, 'key id recordWitness');
      if (kind === 'claim-witness') operation.recordWitness = '{}';
      if (kind === 'claim-format') {
        const data = fields((claim.row.value as { data: unknown }).data, 'intent started usage state settledUsage stopped');
        data.locatorId = pointer.id;
        operation.recordWitness = canonicalJson(claim.row);
        await db.put('records', claim.row, [pointer.gameId, claim.row.id]);
      }
      await db.put('receipts', receipt, [pointer.gameId, receipt.attemptId]); return;
    }
    if (kind === 'root') value.launchId = 'wrong-root';
    if (kind === 'source') value.sourceAttemptId = 'wrong-claim-source';
    if (kind === 'revision') pointer.revision--;
    if (kind === 'original') (value.original as { id: string }).id = 'wrong-original';
    if (kind === 'binding') (value.binding as { grant: { id: string } }).grant.id = 'wrong-grant';
    await db.put('records', pointer, [pointer.gameId, pointer.id]);
  } finally { db.close(); }
}
export const claimedRecovery = {
  async boot(options: SeedOptions = {}) { state = await seedPregrantProof(options); return state.seed; },
  claim, locator, corrupt,
  async receipt() {
    const pointer = await locator(), attemptId = (pointer.value as { sourceAttemptId: string }).sourceAttemptId;
    return (await readCanonical(p => p.sourceReceipt(attemptId))).value.receipt;
  },
  async acknowledge(rootFirst = false) {
    const s = state!, root = async () => s.root.acknowledge(await s.root.entry());
    if (rootFirst) await root();
    const stopped = { ...s.entry, state: 'cancelled', stopDecision: s.entry.latestEvent };
    const proof = terminalAcknowledgement(s.identity, s.seed.binding, stopped, 'decision-handoff');
    await s.session.cleanupHostOperation({ kind: 'verified-ack', ...await proof.prepare(), verify: proof.verify });
    if (!rootFirst) await root();
  },
  async failClaim() {
    const set = CanonicalPages.prototype.set; let staged = false;
    CanonicalPages.prototype.set = function (...args: Parameters<typeof set>) {
      if (args[1].startsWith('agentica/claimed-parents/')) staged = true;
      if (args[1].endsWith('/decision/claim')) throw Error('Injected claim write failure after locator');
      return set.apply(this, args);
    };
    try { await claim(); return { error: '', staged }; }
    catch (error) { return { error: String(error), staged }; }
    finally { CanonicalPages.prototype.set = set; }
  },
  newRoot: () => fundLaunch(state!.session), reset: () => state!.session.resetGame(),
  stop: () => state?.session.stop(),
};
