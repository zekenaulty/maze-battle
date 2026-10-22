import type { GameSession } from '../../src/services/game/GameSession';
import { prepareGameLaunch } from '../../src/services/agentica/game/launch';
import { executeLaunchCommand, readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { launchStartFixture, launchProofFixture } from '../../src/persistence/canonical/agentica/launch.test-support';

/** Typed offline admission fixture only, not HTTP service or provider qualification. */
export async function corpusQueryGrant(session: GameSession) {
  const quests = session.view.game!.quests.filter(quest => quest.status === 'active');
  if (quests.length !== 1) throw Error('Select exactly the one ordinarily accepted corpus quest');
  const fixture = launchStartFixture();
  const prepared = await prepareGameLaunch(session, {
    endpoint: 'ws://127.0.0.1:5266/offline-only', objectiveId: crypto.randomUUID(),
    objective: 'Inspect accepted work and earned memory. Do not move, collect or claim rewards.',
    returnQuestId: quests[0].id, provider: fixture.provider,
    limits: { ...fixture.limits, maxSteps: 16, maxRefinements: 15 },
  });
  const { launchId, start, publication } = prepared;
  await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.dispatch', input: { launchId }, execute: executeLaunchCommand });
  const dispatched = (await readLaunch()).value!;
  const proof = launchProofFixture(start, dispatched.dispatch!.source.attemptId, crypto.randomUUID());
  await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.announce',
    input: { launchId, dispatch: { ...dispatched.dispatch!.ref }, ...proof }, execute: executeLaunchCommand });
  const announced = (await readLaunch()).value!;
  await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.grant',
    input: { launchId, run: { ...announced.run!.ref }, publication: { ...publication } }, execute: executeLaunchCommand });
  const launch = (await readLaunch()).value!;
  return { start, run: launch.run!.value.data.started, binding: { grant: launch.grant!.ref, publication } };
}
