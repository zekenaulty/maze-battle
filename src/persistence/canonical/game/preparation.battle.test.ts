// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { beginBattle } from '../combat/start';
import { mechanicsFixture } from '../combat/mechanics.test-support';
import { currentBattle } from '../combat/coherence';
import { loadBattle, saveBattle } from '../combat/records';
import { loadRoster } from '../roster/projection';
import { saveRoster } from '../roster/write';
import { checkpointJson, gameCheckpoint, rosterContext } from './checkpoint';
import { commitFloorPreparation, prepareGameFloor, readPreparation } from './preparation';

afterEach(() => vi.restoreAllMocks());

describe('canonical floor preparation battle exclusion', () => {
  it.each([
    ['active', 'current-ready'], ['active', 'next-new'], ['active', 'next-in-progress'],
    ['lost', 'current-ready'], ['lost', 'next-new'], ['lost', 'next-in-progress'],
  ] as const)('refuses a %s battle before any allocation or mutation for %s', async (status, phase) => {
    const f = await mechanicsFixture(), floor = await f.floor(); f.storage.install();
    await f.atRoom(floor.exit!.spaceId);
    if (phase === 'next-in-progress') {
      await f.work(tx => commitFloorPreparation(tx, { level: 2 }, 'begin-next-floor'));
      expect(await f.read(pages => readPreparation(pages, 2))).not.toBe('ready');
    }
    await f.work(tx => beginBattle(tx, 'manual'));
    if (status === 'lost') await f.work(async tx => {
      const c = gameCheckpoint(tx.head.checkpoint), prior = (await loadBattle(tx.pages))!;
      await saveBattle(tx.pages, prior, { ...prior, paused: true, battle: { ...prior.battle, status: 'lost' } });
      const roster = await loadRoster(tx.pages, rosterContext(c));
      await saveRoster(tx.pages, roster, { ...roster.state, party: roster.state.party.map(actor => ({ ...actor, hp: 0 })) });
      tx.setCheckpoint(checkpointJson({ ...c, mode: 'manual' }));
    });
    expect((await f.read(pages => currentBattle(pages, gameCheckpoint(f.head().checkpoint))))!.battle.status).toBe(status);
    const input = { level: phase === 'current-ready' ? 1 : 2 }, before = f.storage.snapshot();
    const allocate = vi.fn(async () => { throw Error('Unexpected preparation allocation'); });
    const mutations: string[] = [];
    await expect(f.work(async tx => {
      const set = tx.pages.set.bind(tx.pages);
      vi.spyOn(tx.pages, 'set').mockImplementation((...args) => { mutations.push(args[1]); return set(...args); });
      return commitFloorPreparation({ ...tx, privatePreparation: allocate }, input, 'blocked-battle-preparation');
    })).rejects.toThrow('floor preparation is unavailable during battle');
    expect(allocate).not.toHaveBeenCalled(); expect(mutations).toEqual([]);
    expect(f.storage.snapshot()).toEqual(before);
    // The real receipt/transaction facade also rolls back without changing custody, quota or saved battle rows.
    await expect(prepareGameFloor(f.request(input, 'game.prepare'))).rejects.toThrow('floor preparation is unavailable during battle');
    expect(f.storage.snapshot()).toEqual(before);
  });

  it('validates battle/checkpoint coherence even for an already-ready current floor', async () => {
    const f = await mechanicsFixture(); f.storage.install();
    await f.work(async tx => tx.setCheckpoint(checkpointJson({ ...gameCheckpoint(tx.head.checkpoint), mode: 'battle' })));
    const before = f.storage.snapshot();
    await expect(prepareGameFloor(f.request({ level: 1 }, 'game.prepare'))).rejects.toThrow('battle checkpoint has no battle');
    expect(f.storage.snapshot()).toEqual(before);
  });

  it('keeps legacy battle-free ready floors available with one absent battle-header lookup and no allocation', async () => {
    const f = await mechanicsFixture(), before = f.storage.snapshot(), allocate = vi.fn(async () => { throw Error('Unexpected allocation'); });
    const battleReads: string[] = [], mutations: string[] = [];
    const result = await f.read(async pages => {
      const get = pages.get.bind(pages), set = pages.set.bind(pages);
      vi.spyOn(pages, 'get').mockImplementation((...args) => {
        if (args[1].startsWith('combat/')) battleReads.push(args[1]);
        return get(...args);
      });
      vi.spyOn(pages, 'set').mockImplementation((...args) => { mutations.push(args[1]); return set(...args); });
      return commitFloorPreparation({ head: f.head(), pages, privatePreparation: allocate,
        setCheckpoint() { throw Error('Unexpected checkpoint write'); }, restoreSnapshot: async () => { throw Error('Unexpected restore'); },
        liveOperation: async () => { throw Error('Unexpected custody'); } }, { level: 1 }, 'legacy-ready-floor');
    });
    expect(result).toEqual({ level: 1, phase: 'ready' });
    expect(battleReads).toEqual(['combat/current']); expect(allocate).not.toHaveBeenCalled(); expect(mutations).toEqual([]);
    expect(f.storage.snapshot()).toEqual(before);
  });
});
