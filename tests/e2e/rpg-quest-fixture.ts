import { install as baseInstall, connect } from './rpg-agentica-actions-browser';
import { bindRpgQuest } from '../../src/services/agentica/rpg/quest';
import { questFor } from '../../src/domain/automation/autopilotTestFixtures';
import { prepareRpgLaunch } from '../../src/persistence/rpgAgentica/launch';
import * as events from './rpg-agentica-events-fixture';
import type { SaveControl } from '../../src/persistence/saveControl';

export { connect, prepareRpgLaunch };
export async function install(control: SaveControl, atChest = false) {
  const h = window.rpgCommandTest, room = h.roomAt('seen-room', 'treasure', 2);
  const owned = await h.custody.updateOwnedGame(control, game => ({ ...game,
    maze: h.lineMaze(6, [room], atChest ? 2 : 1),
    quests: [{ ...questFor(room, 'fetch'), id: 'private-quest-placement', title: 'Private target name',
      description: 'Private target coordinates', task: { objective: 'fetch', noun: 'survey seal', required: 1, progress: 0,
        item: { baseId: 'survey-seal', displayName: 'Survey Seal', token: 'seal' } } }],
  }));
  const base = await baseInstall(owned.control), binding = { ...base, runId: 'quest-run', mode: 'quest' as const,
    completionTarget: { floor: 1, row: 0, column: 0 }, quest: bindRpgQuest(owned.game, 'private-quest-placement') };
  await window.rpgAgenticaActionsTest.bindRpgRun(binding);
  await connect(binding);
  return binding;
}

export async function request(capability: string, args: Record<string, unknown>, id = crypto.randomUUID()) {
  const h = window.rpgAgenticaActionsTest, game = window.rpgCommandTest;
  for (let i = 0; i < 16; i++) {
    if ((await game.memory.prepareRpgMemory()).status === 'ready') break;
    if (i === 15) throw new Error('Quest memory not ready');
  }
  const current = await game.custody.readGameControl(), action = h.action(capability, args, id);
  action.expectedRevision = current.control!.revision;
  return action;
}
export async function invoke(capability: string, args: Record<string, unknown>, id = crypto.randomUUID()) {
  const h = window.rpgAgenticaActionsTest, action = await request(capability, args, id);
  await h.reserve(action);
  return { action, ...(await h.executeRpgAction(action)) };
}

export async function navigate(column: number) {
  const admitted = await invoke('maze.navigate', { row: 0, column });
  const id = admitted.result.operation?.operationId;
  if (!id) throw new Error(`Quest travel refused: ${admitted.result.summary}`);
  for (let i = 0; i < 16; i++) {
    const step = await events.advance(await events.next(id));
    if (!step.event) throw new Error('Missing travel event');
    await events.events.acknowledgeRpgHostEvent(step.event);
    if (step.event.kind !== 'progress') return step.event;
  }
  throw new Error('Quest test route exceeded bound');
}
declare global { interface Window { rpgQuestTest: typeof import('./rpg-quest-fixture') } }
