import { seedPregrantProof, type SeedOptions, type ProofSeed } from './canonical-pregrant-proof.setup';
import { provePregrantNoEffect } from '../../src/persistence/canonical/agentica/pregrant-proof';
import { prepareAction } from '../../src/persistence/canonical/agentica/actions';
import { loadDecisionClaim } from '../../src/persistence/canonical/agentica/decision.claim';
import { successorGrantKey } from '../../src/persistence/canonical/agentica/run-grant.certificate';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { canonicalFence } from '../../src/persistence/canonical/transaction';
import type { OwnerFence } from '../../src/persistence/canonical/types';
import { GameSession } from '../../src/services/game/GameSession';
import { createControllerRootRecovery } from './canonical-decision-controller.root';
import { controllerState } from './canonical-decision-controller.state';
import { dump, fillQuota, changeSource } from './canonical-decision-ack.storage';
import { advanceControllerRevision } from './canonical-decision-controller.evidence';
import { changeKey, deleteRow, observeReads } from './canonical-pregrant-proof.storage';
import { fenceOldCallbacks } from './canonical-pregrant-proof.hooks';
import { recoverPregrantAction } from '../../src/services/agentica/game/pendingRecovery';
import { unchangedSchema } from './canonical-recovery-discovery.schema';
import { createGrantedLaunchRecovery, createLaunchRecovery } from '../../src/services/agentica/game/launchRecovery';

if (!import.meta.env.DEV || location.origin !== 'http://127.0.0.1:5268') throw Error('Isolated pregrant proof fixture only');
let state: ProofSeed;
const fence = async () => canonicalFence((await readCanonicalHead()).head);
async function prove(action = state.pending, expected?: OwnerFence) {
  return provePregrantNoEffect(expected ?? await fence(), state.identity, state.seed.binding, action);
}
async function captureInputs() {
  const expected = await fence(), parent = await prepareAction(state.seed.action), binding = structuredClone(state.seed.binding);
  const action = structuredClone(state.pending), result = provePregrantNoEffect(expected, parent, binding, action);
  expected.owner = 'changed-owner'; parent.action.arguments.column = -1; binding.grant.id = 'changed-grant';
  action.runId = 'changed-run'; action.arguments.scope = 'room';
  return result;
}
async function corrupt(kind: 'claim' | 'intent' | 'cancel' | 'publication' | 'parent' | 'selected-grant' | 'pending' | 'result' | 'root-ack') {
  const claim = (await readCanonical(p => loadDecisionClaim(p, state.identity))).value!;
  if (kind === 'claim' || kind === 'intent') return deleteRow('receipts', (kind === 'claim' ? claim : claim.decision).source.attemptId);
  if (kind === 'cancel') return deleteRow('receipts', (await state.root.state()).launch.guard.terminal!.attemptId);
  if (kind === 'root-ack') return deleteRow('receipts', (await state.root.state()).launch.guard.acknowledgementAttemptId!);
  if (kind === 'publication') return deleteRow('records', claim.decision.data.publication.id);
  if (kind === 'parent') return deleteRow('records', claim.decision.terminal.bound.original.reference.id);
  if (kind === 'selected-grant') return changeKey(successorGrantKey(state.identity.storageKey));
  const pending = await prepareAction(state.pending);
  return changeKey(`${pending.storageKey}${kind === 'result' ? '/result' : ''}`, { corrupt: true });
}
const api = {
  async boot(options?: SeedOptions) { state = await seedPregrantProof(options); return { pending: state.pending, parent: state.seed.action }; },
  prove, fence, dump, fillQuota, captureInputs, corrupt, changeSource, advanceRevision: advanceControllerRevision,
  measured: async () => { const expected = await fence(); return observeReads(() => prove(state.pending, expected)); },
  state: () => controllerState(state.seed), stopRoot: () => state.root.stop(),
  acknowledgeRoot: async () => state.root.acknowledge(await state.root.entry()),
  oldCallbacks: () => fenceOldCallbacks(state),
  async wrongParent() {
    const parent = structuredClone(state.seed.action); parent.arguments.column = Number(parent.arguments.column) + 1;
    return provePregrantNoEffect(await fence(), await prepareAction(parent), state.seed.binding, state.pending);
  },
  async wrongBinding() {
    const binding = structuredClone(state.seed.binding); binding.publication.id = 'foreign-publication';
    return provePregrantNoEffect(await fence(), state.identity, binding, state.pending);
  },
  async aborted() {
    const abort = new AbortController(); abort.abort();
    return provePregrantNoEffect(await fence(), state.identity, state.seed.binding, state.pending, { signal: abort.signal });
  },
  databases: async () => (await indexedDB.databases()).map(db => ({ name: db.name, version: db.version })),
  schemaRecovery: (legacy: boolean) => unchangedSchema(legacy, () => api.absent(true)),
  rootSchemaRecovery: (legacy: boolean, granted: boolean) => unchangedSchema(legacy, async () => {
    const forbidden = async () => { throw Error('Schema refusal cannot write or contact the service'); };
    const recovery = await (granted ? createGrantedLaunchRecovery : createLaunchRecovery)({ hostSignal: new AbortController().signal,
      submitHostCommand: forbidden, cleanupHostOperation: forbidden }, 'absent-launch', forbidden);
    recovery.close();
  }),
  async absent(composition = false) {
    const action = { actionId: 'absent-action', runId: 'absent-run', runnerRunId: 'absent-runner', stepId: 'absent-step',
      sessionId: 'absent-session', sessionEpoch: '1', capabilityId: 'maze.navigate', manifestHash: `sha256:${'a'.repeat(64)}`,
      arguments: {}, expectedRevision: 1, deadlineAt: '2026-01-01T00:00:00.000Z' };
    if (composition) return recoverPregrantAction({ hostSignal: new AbortController().signal }, action,
      { grant: { key: 'agentica/absent/grant', id: 'absent-grant' },
        publication: { key: 'agentica/absent/publication', id: 'absent-publication' } }, action,
      { fetchImpl: async () => { throw Error('Schema refusal must not contact the service'); } });
    return provePregrantNoEffect({ generation: 'absent-generation', gameId: 'absent-game', owner: 'absent-owner', epoch: 1, revision: 1 },
      await prepareAction(action), { grant: { key: 'agentica/absent/grant', id: 'absent-grant' },
        publication: { key: 'agentica/absent/publication', id: 'absent-publication' } }, action);
  },
  snapshot: () => JSON.stringify({ seed: state.seed, started: state.started, entry: state.entry, pending: state.pending }),
  async restore(snapshot: string) {
    const saved = JSON.parse(snapshot) as Pick<ProofSeed, 'seed' | 'started' | 'entry' | 'pending'>;
    const session = new GameSession(() => {}); await session.start();
    state = { ...saved, session, identity: await prepareAction(saved.seed.action), root: createControllerRootRecovery(session, saved.seed.launchGuard) };
    return fence();
  },
  stop: () => state?.session.stop(),
};
declare global { interface Window { canonicalPregrantProof: typeof api } }
window.canonicalPregrantProof = api;
