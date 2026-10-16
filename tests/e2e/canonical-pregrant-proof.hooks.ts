import { decisionChannel } from '../../src/services/agentica/game/decisionChannel';
import { createGameActionHooks } from '../../src/services/agentica/game/actionHooks';
import { actionKey, actionFingerprint, type AgenticaHostOptions } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { grantWindow } from './canonical-decision-grant';
import { dump } from './canonical-decision-ack.storage';
import type { ProofSeed } from './canonical-pregrant-proof.setup';

export async function fenceOldCallbacks(state: ProofSeed) {
  let hooks!: AgenticaHostOptions;
  const forbidden = async () => { throw Error('No service calls in pregrant proof fixture'); };
  const channel = decisionChannel(state.session, 'ws://127.0.0.1:5268/forbidden', options => {
    hooks = options;
    return { connect: forbidden, close() {}, listOperations: forbidden, signalOperation: forbidden,
      wakeOperation: forbidden, adoptDecision: forbidden, stopDecision: forbidden };
  });
  channel.accept(state.started.runId);
  const record = { fingerprint: actionFingerprint(state.pending), status: 'pending' as const };
  const failure = async (work: Promise<unknown>) => { try { await work; return 'unexpected success'; } catch (e) { return String(e); } };
  const save = failure(Promise.resolve(hooks.saveAction!(actionKey(state.pending), record)));
  const action = failure(Promise.resolve(hooks.onAction(state.pending)));
  channel.close(); await state.root.stop();
  const before = await dump(), old = createGameActionHooks(state.session, state.seed.binding);
  const fresh = await failure(Promise.resolve(old.saveAction!(actionKey(state.pending), record)));
  const result = await old.onAction!(state.pending), grant = await failure(grantWindow(state.session, state.seed));
  return { save: await save, action: await action, fresh, result, grant, unchanged: await dump() === before };
}
