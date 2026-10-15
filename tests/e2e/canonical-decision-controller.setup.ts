import { seedTransfer } from './canonical-operation-transfer.setup';
import { advanceNavigation, confirmNavigation, settleNavigation } from './canonical-decision.setup';
import { controllerState } from './canonical-decision-controller.state';

export async function seedCompletedController() {
  const { session, seed } = await seedTransfer(); await confirmNavigation(session, seed);
  for (let step = 1; step <= 3; step++) {
    const progress = await advanceNavigation(session, seed);
    if (progress.steps !== step || progress.status !== (step === 3 ? 'arrived' : 'running'))
      throw Error('Controller seed requires three actual earned navigation steps');
  }
  await settleNavigation(session, seed);
  const state = await controllerState(seed), started = { ...state.launch.run!.value.data.started, runId: crypto.randomUUID() };
  const entry = { ...structuredClone(seed.entry), latestEvent: structuredClone(state.prefix.previous!) };
  return { session, seed, started, entry };
}
