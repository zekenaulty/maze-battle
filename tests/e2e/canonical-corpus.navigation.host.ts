import type { GameSession } from '../../src/services/game/GameSession';
import type { CanonicalCommit } from '../../src/services/game/CanonicalHostCommand';
import type { AgenticaAction, AgenticaResult, AgenticaStart } from '../../src/services/agentica/contracts';
import { createGameActionHooks } from '../../src/services/agentica/game/actionHooks';
import type { ActionBinding } from '../../src/services/agentica/game/actionContract';
import { actionKey, actionFingerprint } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { prepareGameLaunch } from '../../src/services/agentica/game/launch';
import { executeLaunchCommand, readLaunch } from '../../src/persistence/canonical/agentica/launch';
import type { LaunchStarted } from '../../src/persistence/canonical/agentica/launch.types';
import { launchProofFixture, launchStartFixture } from '../../src/persistence/canonical/agentica/launch.test-support';
import { startProbe, finishProbe } from './canonical-revisit.probe';

export type WindowSource = { start: AgenticaStart; run: LaunchStarted; binding: ActionBinding };
export type Frame = { action: AgenticaAction; result: AgenticaResult; binding: ActionBinding };
export const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

/** Entire host-call native work, not only the reserve/resolve transaction. Timings remain raw, not compared. */
export function measuredHost(session: GameSession) {
  const commits: { operation: string; stats: CanonicalCommit['stats']; receipt: CanonicalCommit['receipt'] }[] = [];
  const submit = session.submitHostCommand.bind(session);
  session.submitHostCommand = command => submit({ ...command, execute: async (request, options) => {
    const result = await command.execute(request, options);
    commits.push({ operation: request.operation, stats: result.stats, receipt: result.receipt }); return result;
  } });
  return async function measure<T>(work: () => Promise<T>) {
    const start = commits.length; await startProbe();
    try { const value = await work(); return { value, commits: commits.slice(start), native: await finishProbe() }; }
    catch (error) { const native = await finishProbe(); window.navigationFailure = { error: String(error), commits: commits.slice(start), native }; throw error; }
  };
}

/** Typed offline admission only; no SDK transport, service factory or provider invocation. */
export async function launch(session: GameSession): Promise<WindowSource> {
  const quests = session.view.game!.quests.filter(q => q.status === 'active');
  if (quests.length !== 1) throw Error('Expected the ordinarily accepted public survey quest');
  const fixture = launchStartFixture();
  const prepared = await prepareGameLaunch(session, { endpoint: 'ws://127.0.0.1:5457/offline-only',
    objectiveId: crypto.randomUUID(), objective: 'Compare earned navigation and immediate historical decisions.',
    returnQuestId: quests[0].id, provider: fixture.provider,
    limits: { ...fixture.limits, maxSteps: 64, maxRefinements: 48, maxPlanContinuations: 8, timeoutSeconds: 300, actionTimeoutSeconds: 30 } });
  const { launchId, start, publication } = prepared;
  await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.dispatch', input: { launchId }, execute: executeLaunchCommand });
  const dispatched = (await readLaunch()).value!;
  const proof = launchProofFixture(start, dispatched.dispatch!.source.attemptId, crypto.randomUUID());
  await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.announce',
    input: { launchId, dispatch: { ...dispatched.dispatch!.ref }, ...proof }, execute: executeLaunchCommand });
  const announced = (await readLaunch()).value!;
  await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.launch.grant',
    input: { launchId, run: { ...announced.run!.ref }, publication: { ...publication } }, execute: executeLaunchCommand });
  const retained = (await readLaunch()).value!;
  return { start: retained.acceptedStart, run: retained.run!.value.data.started, binding: { grant: retained.grant!.ref, publication } };
}

export async function invoke(session: GameSession, window: WindowSource, capabilityId: string, args: Record<string, unknown>): Promise<Frame> {
  const action: AgenticaAction = { actionId: crypto.randomUUID(), runnerRunId: crypto.randomUUID(), stepId: crypto.randomUUID(),
    runId: window.run.runId, sessionId: window.run.sessionId, sessionEpoch: window.run.sessionEpoch,
    manifestHash: window.run.manifestHash, capabilityId, arguments: structuredClone(args),
    expectedRevision: window.start.observation.revision, deadlineAt: new Date(Date.now() + 30_000).toISOString() };
  const hooks = createGameActionHooks(session, window.binding);
  await hooks.saveAction!(actionKey(action), { fingerprint: actionFingerprint(action), status: 'pending' });
  const result = await hooks.onAction!(action);
  if (!result.observation) throw Error('Every result must retain its bounded observation');
  return { action, result, binding: structuredClone(window.binding) };
}
declare global { interface Window { navigationFailure?: unknown } }
