import * as api from '../../src/persistence/streamRepository';
import { openRepositoryPlanningSession, reconcileRepositoryAction } from '../../src/services/expedition/planning/repositoryHost';
import { StreamPlanner } from '../../src/domain/expedition/streaming/planner';
import { PLANNING_PROTOCOL, type HostMessage, type PlanningFrame } from '../../src/services/expedition/planning/contracts';

const recipe = { version: 'spaces-v2', worldId: 'adapter-test', floorId: 'floor-one', level: 1, seed: 20261008 } as const;
const slot = 'adapter-test';
async function setup() {
  await api.createStreamSlot(slot, recipe);
  const session = await openRepositoryPlanningSession(slot, crypto.randomUUID(), 'explore-floor', { actions: 4096, elapsedMs: 300000, frameBytes: 131072 });
  const start = await session.start();
  if (start.type !== 'start') throw new Error('Session failed to start');
  return { session, start };
}

async function play() {
  const { session, start } = await setup();
  const planner = new StreamPlanner();
  let frame: PlanningFrame = start.frame;
  let response: HostMessage = start;
  let lastRequest = '';
  let actions = 0;
  let maximumFrame = 0;
  for (; actions < 4096; actions++) {
    const decision = planner.choose(frame.checkpoint, frame.knowledge, start.binding);
    if (!decision.command) throw new Error(decision.reason);
    lastRequest = JSON.stringify({ protocol: PLANNING_PROTOCOL, binding: start.binding, type: 'action.request', actionId: `run-${actions}`,
      expectedRevision: frame.checkpoint.revision, expectedTopologyRevision: frame.checkpoint.topologyRevision, command: decision.command });
    // Streaming progress and a partial proposal never reach the executable message path.
    await session.handle(JSON.stringify({ protocol: PLANNING_PROTOCOL, binding: start.binding, type: 'progress', sequence: actions,
      stage: 'planning', summary: 'Evaluating observed room.' }));
    response = await session.handle(lastRequest);
    if (response.type !== 'action.result' || response.result.disposition !== 'applied' || !response.frame) throw new Error(JSON.stringify(response));
    frame = response.frame;
    maximumFrame = Math.max(maximumFrame, new TextEncoder().encode(JSON.stringify(frame)).byteLength);
    if (JSON.stringify(frame).includes('20261008')) throw new Error('Seed leaked');
    if (decision.command.type === 'finish') break;
  }
  const outcome = await session.handle(JSON.stringify({ protocol: PLANNING_PROTOCOL, binding: start.binding, type: 'outcome',
    status: 'complete', resultActionId: JSON.parse(lastRequest).actionId, summary: 'Returned with all observed objectives complete.' }));
  return { outcome, actions: actions + 1, frame, maximumFrame, lastRequest, diagnostics: session.diagnostics };
}
const harness = { api, recipe, slot, setup, play, openRepositoryPlanningSession, reconcileRepositoryAction, PLANNING_PROTOCOL };
declare global { interface Window { planning: typeof harness } }
window.planning = harness;
