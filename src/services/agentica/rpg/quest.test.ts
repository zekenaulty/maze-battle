import { describe, it, expect } from 'vitest';
import { createNewGameState } from '../../../domain/gameFactory';
import { lineMaze, questFor, roomAt } from '../../../domain/automation/autopilotTestFixtures';
import type { ItemInstance } from '../../../domain/types';
import { bindRpgQuest, rpgObjectiveComplete, rpgQuestStatus } from './quest';
import type { RpgAgenticaBinding } from './contracts';
import { rpgCapabilities } from './capabilities';
import { parseRpgAction, validateRpgBinding } from './validation';
import type { AgenticaAction } from '../contracts';

const room = roomAt('unseen-room', 'treasure', 4);
const item = { baseId: 'survey-seal', displayName: 'Survey Seal', token: '[seal]' };
function setup() {
  const game = createNewGameState({ id: 'game', maze: lineMaze(6, [room]), randomBattles: false });
  game.quests = [{ ...questFor(room, 'fetch'), task: { objective: 'fetch', noun: 'seal', required: 1, progress: 0, item } }];
  const scopeId = '28d5f6c1-5618-4d7b-83c2-1765a1747212';
  const binding: RpgAgenticaBinding = { protocolVersion: 1, hostId: 'maze-battle', gameId: game.id, floor: 1,
    sessionId: scopeId, scopeId, sessionEpoch: '1', perspectiveId: 'party', runId: 'run', objectiveId: 'retrieve', objective: 'Retrieve',
    manifestHash: `sha256:${'a'.repeat(64)}`, control: { owner: 'owner', epoch: 1, revision: 0 },
    completionTarget: { floor: 1, row: 0, column: 0 }, travelLimits: { steps: 64, replans: 4, durationMs: 120000 },
    mode: 'quest', quest: bindRpgQuest(game, game.quests[0].id) };
  const collectible: ItemInstance = { ...item, id: 'physical-item', questId: game.quests[0].id,
    category: 'quest', rarity: 'common', itemLevel: 1, value: 0, quantity: 1 };
  return { game, binding, collectible };
}

describe('retrieval projection and host completion', () => {
  it('reads only own log/pack and actor, never hidden quest placement or world topology', () => {
    const { game, binding } = setup();
    for (const field of ['targetRoomId', 'targetRoomName', 'description', 'title'])
      Object.defineProperty(game.quests[0], field, { get: () => { throw new Error('private placement read'); } });
    for (const field of ['layout', 'cells', 'end'])
      Object.defineProperty(game.maze, field, { get: () => { throw new Error('hidden maze read'); } });
    Object.defineProperty(game, 'chests', { get: () => { throw new Error('hidden chest read'); } });
    const status = rpgQuestStatus(game, binding);
    expect(status).toMatchObject({ carried: 0, atReturn: true, complete: false, item: { name: 'Survey Seal' } });
    expect(JSON.stringify(status)).not.toMatch(/unseen-room|test-|questId|baseId|targetRoom/);
  });
  it('requires real carried item, completed ordinary quest and return position simultaneously', () => {
    const { game, binding, collectible } = setup();
    game.inventory.items = [collectible];
    expect(rpgObjectiveComplete(game, binding)).toBe(false);
    game.quests[0].status = 'complete';
    expect(rpgObjectiveComplete(game, binding)).toBe(true);
    game.maze.active.column = 1;
    expect(rpgObjectiveComplete(game, binding)).toBe(false);
    game.maze.active.column = 0; game.inventory.items = []; game.stash.items = [collectible];
    expect(rpgObjectiveComplete(game, binding)).toBe(false);
    game.inventory.items = [{ ...collectible, questId: 'different-quest' }];
    expect(rpgObjectiveComplete(game, binding)).toBe(false);
    game.inventory.items = [collectible]; game.quests[0].task.item = { ...item, baseId: 'different-item' };
    expect(rpgObjectiveComplete(game, binding)).toBe(false);
  });
  it('keeps prior destination and exploration completion behavior', () => {
    const { game, binding } = setup();
    const { mode: _mode, quest: _quest, ...known } = binding;
    expect(rpgObjectiveComplete(game, known)).toBe(true);
    expect(rpgObjectiveComplete(game, { ...known, mode: 'exploration' })).toBe(false);
    game.dungeonLevel = 2;
    expect(rpgObjectiveComplete(game, known)).toBe(false);
  });
  it('refuses unaccepted, legacy, claimed or cross-floor quests at launch', () => {
    const { game } = setup(), id = game.quests[0].id;
    expect(() => bindRpgQuest(game, 'other')).toThrow();
    game.quests[0].floor = 2; expect(() => bindRpgQuest(game, id)).toThrow();
    game.quests[0].floor = 1; game.quests[0].status = 'claimed'; expect(() => bindRpgQuest(game, id)).toThrow();
    game.quests[0].status = 'active'; delete game.quests[0].task.item; expect(() => bindRpgQuest(game, id)).toThrow();
  });
  it('only retrieval binds chest effects, with exact arguments and a durable decision handoff', () => {
    const { binding } = setup();
    const action: AgenticaAction = { actionId: 'open', runId: binding.runId, runnerRunId: 'runner', stepId: 'step',
      sessionId: binding.sessionId, sessionEpoch: binding.sessionEpoch, manifestHash: binding.manifestHash,
      capabilityId: 'maze.open-chest', arguments: { chestId: 'observed' }, expectedRevision: 0, deadlineAt: new Date().toISOString() };
    expect(parseRpgAction(action, binding)).toEqual({ type: 'open-chest', chestId: 'observed' });
    const { quest: _quest, ...explore } = binding;
    expect(() => parseRpgAction(action, { ...explore, mode: 'exploration' })).toThrow();
    expect(() => parseRpgAction({ ...action, arguments: { chestId: 'observed', autoLoot: true } }, binding)).toThrow();
    expect(() => validateRpgBinding({ ...binding, quest: { ...binding.quest, hiddenTarget: room.id } })).toThrow();
    expect(() => validateRpgBinding({ ...explore, mode: 'quest' })).toThrow();
    const caps = rpgCapabilities('quest');
    expect(caps.slice(0, 7)).toEqual(rpgCapabilities(true));
    expect(caps[7]).toMatchObject({ id: 'maze.open-chest', kind: 'action', effect: 'writesLocalState' });
    expect(caps[7].durableHandoff).toBe(true);
    expect(caps[8]).toMatchObject({ id: 'quest.status', kind: 'query', effect: 'readOnly' });
  });
});
