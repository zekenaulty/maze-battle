import type { AgenticaAction, AgenticaStart } from '../../src/services/agentica/contracts';
import type { GameSession } from '../../src/services/game/GameSession';
import { actionFingerprint, actionKey } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { prepareAction, readAction } from '../../src/persistence/canonical/agentica/actions';
import { readCanonical } from '../../src/persistence/canonical/read';
import { controllerState } from './canonical-decision-controller.state';
import { draftNavigationWindow } from './canonical-decision-window';
import type { TransferSeed } from './canonical-operation-transfer.setup';
import type { DecisionSdkFixture } from './canonical-decision-controller.sdk';

export async function draftSuccessor(session: GameSession, seed: TransferSeed, sdk: DecisionSdkFixture) {
  const state = await controllerState(seed), intent = state.intent;
  if (!intent) throw Error('Fixture needs an explicitly prepared decision');
  const request = { ...seed.entry.request, sessionEpoch: sdk.remote.started.sessionEpoch,
    observation: intent.data.adoption?.observation ?? intent.data.event.observation } as AgenticaStart;
  return draftNavigationWindow(session, { binding: seed.binding, request,
    started: sdk.remote.started, usage: seed.entry.usage }).action;
}
export async function retainedAction(action: AgenticaAction) {
  const identity = await prepareAction(action); return (await readCanonical(p => readAction(p, identity))).value;
}
export function pendingSave(sdk: DecisionSdkFixture, action: AgenticaAction) {
  const options = sdk.options.at(-1); if (!options?.saveAction) throw Error('Missing controller SDK hooks');
  return options.saveAction(actionKey(action), { fingerprint: actionFingerprint(action), status: 'pending' });
}
export async function completedReplay(sdk: DecisionSdkFixture, action: AgenticaAction, forged = false) {
  const options = sdk.options.at(-1), retained = await retainedAction(action);
  if (!options?.saveAction || !retained?.result) throw Error('Missing original completed result');
  const result = structuredClone(retained.result); if (forged) result.summary += ' changed';
  await options.saveAction(actionKey(action), { fingerprint: actionFingerprint(action), status: 'completed', result });
  return options.reconcileAction!(action, null);
}
