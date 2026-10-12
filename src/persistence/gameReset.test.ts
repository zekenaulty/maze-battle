import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetGame } from './gameReset';
import { resetStorage } from './gameReset.testSupport';
import { claimGame, readGameControl, updateOwnedGame } from './gameCustody';
import { readRpgHistory } from './observationArchive';
import { AUTO_CONTROL_KEY, SaveOwnershipError } from './saveControl';
import { saveTelemetry } from './telemetryRepository';
import { createPlayTelemetry } from '../domain/telemetry/transitions';
import type { SaveSlot } from '../domain/types';

const storage = vi.hoisted(() => ({ getDatabase: vi.fn() }));
vi.mock('./saveRepository', () => storage);
let db: ReturnType<typeof resetStorage>;
beforeEach(() => { db = resetStorage(); storage.getDatabase.mockResolvedValue(db); });

describe('explicit clean-start transaction', () => {
  it('bypasses corrupt history and clears every current store before seeding a real RPG root', async () => {
    const previous = await resetGame();
    const slot = db.tables.get('saves')!.get('auto') as SaveSlot;
    slot.observationHead = 'missing-corrupt-head';
    await expect(claimGame('reader', true)).rejects.toThrow();
    for (const table of db.tables.values()) table.set('discard', { broken: true });
    db.get.mockClear(); db.transaction.mockClear();
    const next = await resetGame();
    expect(db.transaction).toHaveBeenCalledExactlyOnceWith(db.objectStoreNames, 'readwrite');
    expect(db.get).not.toHaveBeenCalled();
    expect(next.control.owner).not.toBe(previous.control.owner);
    expect(next.game.id).not.toBe(previous.game.id);
    expect(next.game).toMatchObject({ mode: 'manual', source: { type: 'new-game' }, dungeonLevel: 1 });
    expect(next.game.party).toHaveLength(3);
    expect(next.game.maze.cells.length).toBeGreaterThan(0);
    expect(next.game.maze.layout?.version).toBe('structured-v3');
    for (const [name, table] of db.tables) {
      expect(table.has('discard')).toBe(false);
      expect(table.size).toBe(['saves', 'meta', 'observations', 'telemetry'].includes(name) ? 1 : 0);
    }
    expect(await readGameControl()).toEqual(next);
    const history = await readRpgHistory();
    expect(history.records).toHaveLength(1);
    expect(history.records[0]).toMatchObject({ id: next.observationHead, gameId: next.game.id, depth: 1, ancestors: [] });
    expect(history.records[0].observation.revision).toEqual(next.control);
    await expect(updateOwnedGame(next.control, game => game)).resolves.toMatchObject({ game: next.game });
  });

  it.each(['{', '{"owner":"old","epoch":0,"revision":-1}'])('does not decode invalid control: %s', async value => {
    db.tables.get('meta')!.set(AUTO_CONTROL_KEY, { key: AUTO_CONTROL_KEY, value });
    await expect(claimGame('reader', true)).rejects.toThrow();
    db.get.mockClear();
    const next = await resetGame();
    expect(db.get).not.toHaveBeenCalled();
    expect(next.control).toMatchObject({ epoch: 1, revision: 1 });
    expect(await readGameControl()).toEqual(next);
  });

  it.each(['observations', 'saves', 'telemetry'])('aborts the entire clear/seed scope on %s failure', async store => {
    await resetGame();
    for (const table of db.tables.values()) table.set('retained-on-abort', { old: true });
    const before = structuredClone(db.tables);
    db.failWrites(store);
    await expect(resetGame()).rejects.toThrow('Injected storage failure');
    expect(db.transaction.mock.results.at(-1)!.value.abort).toHaveBeenCalledOnce();
    expect(db.tables).toEqual(before);
  });

  it('fences old owners and telemetry writers even when epoch/revision restart at the same numbers', async () => {
    const old = await resetGame(), current = await resetGame();
    expect(old.control.epoch).toBe(current.control.epoch);
    expect(old.control.revision).toBe(current.control.revision);
    const reducer = vi.fn(game => game);
    await expect(updateOwnedGame(old.control, reducer)).rejects.toBeInstanceOf(SaveOwnershipError);
    await expect(saveTelemetry(createPlayTelemetry(old.game.id), old.control)).rejects.toBeInstanceOf(SaveOwnershipError);
    expect(reducer).not.toHaveBeenCalled();
    expect(await readGameControl()).toEqual(current);
    expect(db.tables.get('telemetry')!.has(old.game.id)).toBe(false);
  });
});
