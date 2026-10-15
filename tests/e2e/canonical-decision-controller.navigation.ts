import type { AgenticaAction } from '../../src/services/agentica/contracts';
import type { GameSession } from '../../src/services/game/GameSession';
import type { TransferSeed } from './canonical-operation-transfer.setup';
import type { DecisionSdkFixture } from './canonical-decision-controller.sdk';
import { controllerState } from './canonical-decision-controller.state';
import { pendingSave } from './canonical-decision-controller.actions';
import { advanceNavigation, confirmNavigation, settleNavigation } from './canonical-decision.setup';

export async function moveControllerSuccessor(session: GameSession, original: TransferSeed,
  sdk: DecisionSdkFixture, input: AgenticaAction) {
  const action = structuredClone(input), state = await controllerState(original), { grant, claim } = state;
  if (!grant || !claim) throw Error('Need the explicitly claimed and granted controller');
  await pendingSave(sdk, action);
  const admission = await sdk.options.at(-1)!.onAction(action);
  if (!admission.operation) throw Error(JSON.stringify(admission));
  const seed: TransferSeed = { action, binding: { grant: grant.record.ref, publication: grant.record.value.data.publication },
    operationId: admission.operation.operationId, launchGuard: original.launchGuard,
    entry: { action, request: grant.start, admission, usage: claim.data.usage, activeEpoch: action.sessionEpoch, state: 'parked' } };
  await confirmNavigation(session, seed);
  return { seed, progress: await advanceNavigation(session, seed) };
}

export async function completeControllerSuccessor(session: GameSession, original: TransferSeed,
  sdk: DecisionSdkFixture, action: AgenticaAction) {
  const moved = await moveControllerSuccessor(session, original, sdk, action);
  for (let step = 2; step <= 3; step++) {
    moved.progress = await advanceNavigation(session, moved.seed);
    if (moved.progress.steps !== step) throw Error('Successor did not earn the expected navigation step');
  }
  if (moved.progress.status !== 'arrived') throw Error('Successor did not arrive');
  await settleNavigation(session, moved.seed); return moved;
}
