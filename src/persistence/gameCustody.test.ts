import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewGameState, normalizeGameState } from '../domain/gameFactory';
import { lineMaze } from '../domain/automation/autopilotTestFixtures';
import type { GameState, SaveSlot } from '../domain/types';
import { claimGame, loadOwnedGame, readGameControl, replaceOwnedGame, updateOwnedGame, type OwnedGame } from './gameCustody';
import { executeOwnedGameCommand, settleGameCommand } from './gameCommands';
import type { GameCommandRequest } from './gameCommandTypes';
import { currentGame } from './rpgTravel/execute';
import type { GameWrite } from './gameTransaction';
import { AUTO_CONTROL_KEY, decodeControl } from './saveControl';
import type { RpgObservationNode } from './observationTypes';

const storage = vi.hoisted(() => ({ getDatabase: vi.fn() }));
vi.mock('./saveRepository', () => storage);

const tables = new Map<string, Map<string, unknown>>();
const table = (name: string) => {
  if (!tables.has(name)) tables.set(name, new Map());
  return tables.get(name)!;
};
// Result-projection fixture only; native transaction atomicity is covered by the browser spec.
const transaction = vi.fn(() => ({
  objectStore(name: string) {
    const write = async (value: Record<string, unknown>) => {
      const key = value.slotId ?? value.key ?? value.attemptId ?? value.id;
      table(name).set(String(key), structuredClone(value));
    };
    return { get: async (key: string) => structuredClone(table(name).get(key)), put: write, add: write };
  },
  done: Promise.resolve(), abort: vi.fn(),
}));
const game = () => createNewGameState({ id: 'custody-head', maze: lineMaze(6, [], 1), randomBattles: false });
const slot = () => table('saves').get('auto') as SaveSlot;
function seed(state = game()) {
  table('saves').set('auto', { slotId: 'auto', kind: 'auto', label: 'Seed', game: state,
    createdAt: state.createdAt, updatedAt: state.updatedAt });
}
function matchesSlot(state: OwnedGame) {
  const control = decodeControl(table('meta').get(AUTO_CONTROL_KEY) as { value: string });
  expect(state).toEqual({ control, game: slot().game, observationHead: slot().observationHead });
}
function request(state: OwnedGame, attemptId: string): GameCommandRequest {
  return { attemptId, gameId: state.game.id, control: state.control, floor: state.game.dungeonLevel,
    position: state.game.maze.active, deadlineAt: Date.now() + 120_000,
    command: { type: 'move', direction: 'east', triggerStairs: false } };
}

beforeEach(() => {
  tables.clear(); transaction.mockClear(); storage.getDatabase.mockResolvedValue({ transaction });
});

describe('custody observation head projection', () => {
  it('reads and claims exact slot heads in one transaction, including no head and non-owner claims', async () => {
    expect(await readGameControl()).toEqual({ control: undefined, game: undefined, observationHead: undefined });
    seed({ ...game(), mode: 'town' });
    const headless = await claimGame('owner'); matchesSlot(headless);
    expect(headless.observationHead).toBeUndefined();
    const observed = await updateOwnedGame(headless.control, g => ({ ...g, mode: 'manual' })); matchesSlot(observed);
    expect(observed.observationHead).toEqual(expect.any(String));
    expect(await readGameControl()).toEqual(observed);
    expect(await claimGame('reader')).toEqual(observed);
    const taken = await claimGame('new-owner', true); matchesSlot(taken);
    expect(taken.observationHead).toBe(observed.observationHead);
    expect(transaction).toHaveBeenCalledTimes(6);
  });

  it('returns the committed initial head when claiming a new autosave', async () => {
    const initial = await claimGame('owner'); matchesSlot(initial);
    expect(initial.observationHead).toEqual(expect.any(String));
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it.each(['manual', 'town'] as const)('validates a follower head and predecessor in %s without writing evidence', async mode => {
    seed();
    const first = await claimGame('owner');
    const latest = await updateOwnedGame(first.control, game => ({ ...game, maze: { ...game.maze, active: { row: 0, column: 3 } } }));
    slot().game.mode = mode;
    const before = structuredClone(tables);
    expect(await claimGame('follower')).toEqual({ ...latest, game: normalizeGameState(slot().game) });
    expect(tables).toEqual(before);
  });

  it('leaves an explicitly headless follower checkpoint headless', async () => {
    seed({ ...game(), mode: 'town' });
    const first = await claimGame('owner'), before = structuredClone(tables);
    expect(await claimGame('follower')).toEqual(first);
    expect(tables).toEqual(before);
    expect(table('observations').size).toBe(0);
  });

  it.each(['missing-head', 'invalid-head', 'missing-predecessor', 'invalid-predecessor', 'regressing-revision', 'wrong-owner'])
    ('rejects follower %s without changing saves, control, or evidence', async corruption => {
      seed();
      const first = await claimGame('owner');
      const latest = await updateOwnedGame(first.control, game => ({ ...game, maze: { ...game.maze, active: { row: 0, column: 3 } } }));
      const head = table('observations').get(latest.observationHead!) as RpgObservationNode;
      const parent = table('observations').get(first.observationHead!) as RpgObservationNode;
      expect(head.depth).toBe(2);
      if (corruption === 'missing-head') table('observations').delete(head.id);
      if (corruption === 'invalid-head') table('observations').set(head.id, { ...head, lineage: 'invalid' });
      if (corruption === 'missing-predecessor') table('observations').delete(parent.id);
      if (corruption === 'invalid-predecessor') table('observations').set(parent.id, { ...parent, lineage: 'invalid' });
      if (corruption === 'regressing-revision' || corruption === 'wrong-owner') table('observations').set(head.id, {
        ...head, observation: { ...head.observation, revision: { ...head.observation.revision,
          ...(corruption === 'regressing-revision' ? { revision: 0 } : { owner: 'unrelated-owner' }) } },
      });
      const before = structuredClone(tables);
      await expect(claimGame('follower')).rejects.toThrow('Invalid or unavailable observation history');
      expect(transaction.mock.results.at(-1)!.value.abort).toHaveBeenCalledOnce();
      expect(tables).toEqual(before);
    });

  it('keeps unchanged and town heads, restores source lineage, and clears headless replacements and loads', async () => {
    seed();
    const initial = await claimGame('owner');
    table('saves').set('manual', structuredClone({ ...slot(), slotId: 'manual', kind: 'manual' }));
    let state = await updateOwnedGame(initial.control, g => ({ ...g, facing: 'north' })); matchesSlot(state);
    expect(state.observationHead).toBe(initial.observationHead);
    state = await updateOwnedGame(state.control, g => ({ ...g, maze: { ...g.maze, active: { row: 0, column: 3 } } })); matchesSlot(state);
    const moved = state.observationHead;
    expect(moved).not.toBe(initial.observationHead);
    state = await updateOwnedGame(state.control, g => ({ ...g, mode: 'town' })); matchesSlot(state);
    expect(state.observationHead).toBe(moved);
    state = await loadOwnedGame(state.control, 'manual'); matchesSlot(state);
    expect(state.observationHead).toBe(initial.observationHead);
    state = await replaceOwnedGame(state.control, game()); matchesSlot(state);
    expect(state.observationHead).not.toBe(initial.observationHead);
    state = await replaceOwnedGame(state.control, { ...game(), mode: 'town' }); matchesSlot(state);
    expect(state.observationHead).toBeUndefined();
    table('saves').set('headless', { ...slot(), slotId: 'headless', kind: 'manual' });
    state = await loadOwnedGame(state.control, 'manual'); matchesSlot(state);
    expect(state.observationHead).toBe(initial.observationHead);
    state = await loadOwnedGame(state.control, 'headless'); matchesSlot(state);
    expect(state.observationHead).toBeUndefined();
    expect(transaction).toHaveBeenCalledTimes(9);
  });

  it('replays the original receipt with the current game/head and refuses stale requests without a historical head', async () => {
    seed();
    const initial = await claimGame('owner'), original = request(initial, 'original');
    const first = await executeOwnedGameCommand(original); matchesSlot(first.current!);
    expect(first.receipt.observationHead).toBe(first.current!.observationHead);
    const second = await executeOwnedGameCommand(request(first.current!, 'second')); matchesSlot(second.current!);
    expect(second.receipt.observationHead).not.toBe(first.receipt.observationHead);
    for (const replay of [await executeOwnedGameCommand(original), await settleGameCommand(original)]) {
      matchesSlot(replay.current!);
      expect(replay.replayed).toBe(true);
      expect(replay.receipt).toEqual(first.receipt);
      expect(replay.current).toEqual(second.current);
    }
    for (const reason of ['conflict', 'expired', 'settled'] as const) {
      const input = request(reason === 'conflict' ? initial : second.current!, reason);
      if (reason === 'expired') input.deadlineAt = 0;
      const refused = await (reason === 'settled' ? settleGameCommand(input) : executeOwnedGameCommand(input));
      matchesSlot(refused.current!);
      expect(refused.receipt.outcome).toEqual({ status: 'not-applied', reason });
      expect(refused.receipt.observationHead).toBeUndefined();
    }
    const headless = await replaceOwnedGame(second.current!.control, { ...game(), mode: 'town' });
    const replay = await executeOwnedGameCommand(original); matchesSlot(replay.current!);
    expect(replay.receipt).toEqual(first.receipt);
    expect(replay.current).toEqual(headless);
    expect(replay.current!.observationHead).toBeUndefined();
    expect(transaction).toHaveBeenCalledTimes(10);
  });

  it.each(['manual', 'town'] as const)('returns the committed slot head for a refused command in %s', async mode => {
    seed({ ...game(), mode });
    const initial = await claimGame('owner'), input = request(initial, 'refused');
    input.command = { type: 'move', direction: 'north', triggerStairs: false };
    const result = await executeOwnedGameCommand(input); matchesSlot(result.current!);
    expect(result.receipt.outcome).toEqual({ status: 'refused', reason: mode === 'town' ? 'ineligible' : 'blocked' });
    expect(result.current!.observationHead).toBe(initial.observationHead);
    expect(result.receipt.observationHead).toBe(initial.observationHead);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('projects current travel and Agentica game/head from the supplied transaction without opening another', async () => {
    seed();
    const initial = await claimGame('owner');
    const tx = transaction() as unknown as GameWrite;
    transaction.mockClear();
    expect(await currentGame(tx)).toEqual(initial);
    const headless: GameState = { ...initial.game, mode: 'town' };
    table('saves').set('auto', { ...slot(), game: headless, observationHead: undefined });
    expect(await currentGame(tx)).toEqual({ control: initial.control, game: headless, observationHead: undefined });
    table('saves').delete('auto');
    expect(await currentGame(tx)).toBeUndefined();
    expect(transaction).not.toHaveBeenCalled();
  });
});
