import { movePosition, opposite } from '../../src/domain/maze/movement';
import type { Direction, MazeState } from '../../src/domain/types';
import { prepareRpgLaunch } from '../../src/persistence/rpgAgentica/launch';
import { announceRpgLaunch } from '../../src/persistence/rpgAgentica/launchRecords';
import { prepareRpgWake, acknowledgeRpgWake, finishRpgWake } from '../../src/persistence/rpgAgentica/launchWake';
import { bindRpgRun } from '../../src/persistence/rpgAgentica/runs';
import { acknowledgeRpgHostEvent } from '../../src/persistence/rpgAgentica/events';
import { actionKey, actionFingerprint, AgenticaHost } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { saveRpgAction } from '../../src/persistence/rpgAgentica/records';
import type { AgenticaAction } from '../../src/services/agentica/contracts';
import { rpgCapabilities } from '../../src/services/agentica/rpg/capabilities';
import type {} from './rpg-command-fixture';

function dungeon(variant: 'A' | 'B'): MazeState {
  const cells = Array.from({ length: 81 }, (_, i) => ({ row: Math.floor(i / 9), column: i % 9, links: [] as Direction[] }));
  const join = (row: number, column: number, direction: Direction) => {
    const next = movePosition({ row, column }, direction);
    cells[row * 9 + column].links.push(direction); cells[next.row * 9 + next.column].links.push(opposite(direction));
  };
  for (let column = 0; column < 4; column++) join(6, column, 'east');
  if (variant === 'A') for (let column = 4; column < 8; column++) join(6, column, 'east');
  else for (let row = 6; row > 2; row--) join(row, 4, 'north');
  return { rows: 9, columns: 9, start: { row: 6, column: 0 }, end: { row: 8, column: 8 }, active: { row: 6, column: 0 },
    cells, visited: [], visibility: { radius: 2, explored: [] } };
}

export async function setupDiscovery(variant: 'A' | 'B') {
  if (location.origin !== 'http://127.0.0.1:5204') throw new Error('Isolated discovery test only');
  const h = window.rpgCommandTest, game = h.game();
  game.maze = dungeon(variant); game.floors = []; game.quests = [];
  game.chests = [{ id: 'survey-chest', level: 1, opened: false,
    position: variant === 'A' ? { row: 6, column: 6 } : { row: 4, column: 4 } }];
  await h.repository.saveGame('auto', 'Cold discovery', 'auto', game);
  const session = new h.GameSession(() => {}); await session.start(); await session.prepareTravelMemory();
  const launch = await prepareRpgLaunch(session.ownedControl(), { url: 'ws://127.0.0.1:5092/api/host',
    target: { floor: 1, row: 6, column: 0 }, mode: 'exploration' });
  let binding = { ...launch.draft, runId: 'discovery-run', manifestHash: `sha256:${'a'.repeat(64)}` };
  await announceRpgLaunch(launch.id, binding); await bindRpgRun(binding);
  const sdk = new AgenticaHost({ url: 'ws://unused.invalid', onAction: async () => { throw new Error('No transport'); } });
  let sequence = 0;
  const checks: string[] = [];
  const execute = async (action: AgenticaAction) => {
    const result = await session.executeAgenticaAction(action);
    try { (sdk as any)._validateResult(action, result, { objectiveId: binding.objectiveId, capabilities: rpgCapabilities(true) }); }
    catch (error) { checks.push(String(error)); }
    return result;
  };
  const invoke = async (capabilityId: string, args: Record<string, unknown>) => {
    await session.prepareTravelMemory();
    const action: AgenticaAction = { actionId: `action-${++sequence}`, runId: binding.runId, runnerRunId: 'fixture-runner',
      stepId: `step-${sequence}`, sessionId: binding.sessionId, sessionEpoch: binding.sessionEpoch,
      capabilityId, arguments: args, manifestHash: binding.manifestHash, expectedRevision: session.ownedControl().revision,
      deadlineAt: new Date(Date.now() + 120_000).toISOString() };
    await saveRpgAction(actionKey(action), { fingerprint: actionFingerprint(action), status: 'pending' });
    return { action, result: await execute(action) };
  };
  const walk = async (id: string, count = 16) => {
    const events = [];
    for (let i = 0; i < count; i++) {
      await session.prepareTravelMemory();
      const state = await session.readTravel();
      if (!state || state.travel.operation.status !== 'running') break;
      const result = await session.advanceAgenticaOperation(session.travelRequest(id,
        { type: 'step', sequence: state.travel.operation.nextStep }));
      if (!result.event) throw new Error('Missing atomic step evidence');
      events.push(result.event);
      if (result.event.kind !== 'progress') break;
      await acknowledgeRpgHostEvent(result.event);
    }
    return events;
  };
  const continueDecision: DiscoveryHarness['continueDecision'] = async event => {
    await session.prepareTravelMemory();
    const retained = await prepareRpgWake(launch.id, event, session.ownedControl());
    const next = { ...retained.wake!.draft, runId: `${binding.runId}-next`, manifestHash: binding.manifestHash };
    await announceRpgLaunch(launch.id, next); await acknowledgeRpgWake(launch.id, event);
    await bindRpgRun(next); await finishRpgWake(launch.id); binding = next;
    return next;
  };
  const harness = { session, launch, get binding() { return binding; }, checks, invoke, execute, walk, continueDecision };
  window.rpgDiscovery = harness;
  return { initial: launch.request.observation, capabilities: launch.request.capabilities, game: session.view.game };
}
interface DiscoveryHarness {
  session: import('../../src/services/game/GameSession').GameSession;
  launch: Awaited<ReturnType<typeof prepareRpgLaunch>>;
  binding: import('../../src/services/agentica/rpg/contracts').RpgAgenticaBinding;
  checks: string[];
  invoke(capability: string, args: Record<string, unknown>): Promise<{ action: AgenticaAction; result: import('../../src/services/agentica/contracts').AgenticaResult }>;
  execute(action: AgenticaAction): Promise<import('../../src/services/agentica/contracts').AgenticaResult>;
  walk(id: string, count?: number): Promise<import('../../src/services/agentica/sdk/agentica-host.mjs').HostOperationEvent[]>;
  continueDecision(event: import('../../src/services/agentica/sdk/agentica-host.mjs').HostOperationEvent): Promise<import('../../src/services/agentica/rpg/contracts').RpgAgenticaBinding>;
}
declare global { interface Window { rpgDiscovery: DiscoveryHarness } }
