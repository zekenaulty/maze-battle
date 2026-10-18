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
async function corrupt(kind: 'root' | 'source' | 'revision' | 'original' | 'binding' | 'claim' | 'claim-source' | 'root-source') {
  const s = state!, pointer = await locator(), value = pointer.value as Record<string, unknown>;
  const claim = (await readCanonical(p => loadDecisionClaim(p, s.identity))).value!, db = await openCanonicalDatabase();
  try {
    if (kind === 'claim-source' || kind === 'root-source') {
      const attempt = kind === 'claim-source' ? claim.source.attemptId : (await s.root.state()).launch.guard.admissionAttemptId;
      await db.delete('receipts', [pointer.gameId, attempt]); return;
    }
    if (kind === 'claim') { await db.delete('records', [pointer.gameId, claim.reference.id]); return; }
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
