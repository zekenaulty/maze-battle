import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { GameSession, type GameSessionView } from './GameSession';
import { BrowserSaveLock } from './BrowserSaveLock';
import { createNewGameState } from '../../domain/gameFactory';
import type { OwnedGame } from '../../persistence/gameCustody';

const storage = vi.hoisted(() => ({ claimGame: vi.fn(), readGameControl: vi.fn(), updateOwnedGame: vi.fn(),
  resetGame: vi.fn(), getGame: vi.fn(), listSaves: vi.fn(), loadTelemetry: vi.fn(), saveTelemetry: vi.fn() }));
vi.mock('../../persistence/gameCustody', () => storage);
vi.mock('../../persistence/gameReset', () => storage);
vi.mock('../../persistence/saveRepository', () => storage);
vi.mock('../../persistence/telemetryRepository', () => storage);

let session: GameSession;
let views: GameSessionView[];
const owned = (owner: string = crypto.randomUUID()): OwnedGame => ({ game: createNewGameState(),
  control: { owner, epoch: 1, revision: 1 }, observationHead: crypto.randomUUID() });
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(Storage.prototype, 'getItem');
  views = []; session = new GameSession(view => views.push(view));
  storage.claimGame.mockImplementation(async owner => owned(owner));
  storage.resetGame.mockImplementation(async () => owned());
  storage.listSaves.mockResolvedValue([]);
});
afterEach(() => { session.stop(); vi.restoreAllMocks(); });

describe('clean-start session recovery', () => {
  it.each(['Invalid observation history', 'Invalid save control record.', 'IndexedDB is not supported', 'storage denied'])
    ('keeps Load failed stable through refresh without importing or deleting: %s', async message => {
      storage.claimGame.mockRejectedValue(new Error(message));
      await expect(session.start()).rejects.toThrow(message);
      const failed = session.view;
      storage.readGameControl.mockResolvedValue(owned('another-tab'));
      for (let i = 0; i < 3; i++) await session.refresh();
      expect(session.view).toBe(failed);
      expect(session.view).toMatchObject({ status: `Load failed: ${message}`, recoveryRequired: true, busy: false, controlled: false });
      expect(storage.readGameControl).not.toHaveBeenCalled();
      expect(Storage.prototype.getItem).not.toHaveBeenCalled();
      expect(storage.resetGame).not.toHaveBeenCalled();
      await session.resetGame();
      expect(session.view).toMatchObject({ recoveryRequired: false, busy: false, controlled: true });
      expect(storage.claimGame).toHaveBeenCalledOnce();
    });

  it('does not clear a failed load by retrying an unvalidated read-only checkpoint', async () => {
    storage.claimGame.mockRejectedValueOnce(new Error('Invalid observation history'));
    await expect(session.start()).rejects.toThrow();
    storage.claimGame.mockResolvedValueOnce(owned('another-tab'));
    await expect(session.start()).rejects.toThrow('Could not validate');
    await session.refresh();
    expect(session.view.recoveryRequired).toBe(true);
    expect(session.view.status).toMatch(/^Load failed:/);
    expect(session.view.game).toBeUndefined();
  });

  it('keeps recovery visible when listing saves fails after the checkpoint was adopted', async () => {
    storage.listSaves.mockRejectedValueOnce(new Error('Corrupt manual save'));
    await expect(session.start()).rejects.toThrow('Corrupt manual save');
    expect(session.view.game).toBeDefined();
    await session.refresh();
    expect(session.view).toMatchObject({ recoveryRequired: true, controlled: false, status: 'Load failed: Corrupt manual save' });
    await session.start();
    expect(session.view).toMatchObject({ recoveryRequired: false, controlled: true, busy: false });
    expect(storage.resetGame).not.toHaveBeenCalled();
  });

  it.each([false, true])('blocks queued old actions and suppresses stale in-flight results (failure=%s)', async failure => {
    await session.start();
    const oldOwner = session.owner;
    let finish!: (state: OwnedGame) => void, reject!: (error: Error) => void;
    storage.updateOwnedGame.mockReturnValue(new Promise<OwnedGame>((resolve, fail) => { finish = resolve; reject = fail; }));
    session.transition(game => game, { source: 'manual', action: 'in-flight' });
    session.transition(game => game, { source: 'manual', action: 'queued' });
    await waitFor(() => expect(storage.updateOwnedGame).toHaveBeenCalledOnce());
    const resetting = session.resetGame();
    expect(session.view).toMatchObject({ busy: true, controlled: false, status: 'Resetting Maze Battle...' });
    await expect(session.resetGame()).rejects.toThrow('already in progress');
    const count = views.length;
    if (failure) reject(new Error('Late failure')); else finish(owned(oldOwner));
    await resetting;
    expect(storage.updateOwnedGame).toHaveBeenCalledOnce();
    expect(storage.saveTelemetry).not.toHaveBeenCalled();
    expect(views.slice(count).some(view => /Saved|failed/.test(view.status))).toBe(false);
    expect(session.owner).not.toBe(oldOwner);
    expect(session.ownedControl().owner).toBe(session.owner);
    expect(session.view).toMatchObject({ busy: false, controlled: true, recoveryRequired: false });
  });

  it('keeps reset errors truthful and retryable without automatic deletion', async () => {
    await session.start();
    const oldOwner = session.owner;
    storage.resetGame.mockRejectedValueOnce(new Error('QuotaExceededError'));
    await expect(session.resetGame()).rejects.toThrow('QuotaExceededError');
    await session.refresh();
    expect(session.owner).toBe(oldOwner);
    expect(session.view).toMatchObject({ controlled: false, busy: false, recoveryRequired: true, status: 'Reset failed: QuotaExceededError' });
    await session.resetGame();
    expect(storage.resetGame).toHaveBeenCalledTimes(2);
    expect(session.view.controlled).toBe(true);
  });

  it('latches a write failure without refreshing the failed checkpoint or deleting anything', async () => {
    await session.start();
    storage.updateOwnedGame.mockRejectedValue(new Error('Storage unavailable'));
    session.transition(game => game, { source: 'manual', action: 'save' });
    await session.flush();
    const failed = session.view;
    await session.refresh();
    expect(session.view).toBe(failed);
    expect(session.view).toMatchObject({ controlled: false, recoveryRequired: true, status: 'Save failed: Storage unavailable' });
    expect(storage.readGameControl).not.toHaveBeenCalled();
    expect(storage.resetGame).not.toHaveBeenCalled();
  });

  it('requests Web Lock takeover only on explicit reset and stops before clearing if it fails', async () => {
    vi.spyOn(BrowserSaveLock.prototype, 'supported', 'get').mockReturnValue(true);
    const acquire = vi.spyOn(BrowserSaveLock.prototype, 'acquire').mockImplementation(async function (this: BrowserSaveLock) {
      this.held = true; return true;
    });
    await session.start();
    expect(acquire).toHaveBeenNthCalledWith(1);
    acquire.mockResolvedValueOnce(false);
    await expect(session.resetGame()).rejects.toThrow('Could not acquire');
    expect(storage.resetGame).not.toHaveBeenCalled();
    expect(session.view.recoveryRequired).toBe(true);
    await session.resetGame();
    expect(acquire).toHaveBeenNthCalledWith(2, true);
    expect(acquire).toHaveBeenNthCalledWith(3, true);
    expect(storage.resetGame).toHaveBeenCalledOnce();
  });

  it('does not publish a stopped startup or read legacy localStorage on a clean start', async () => {
    let finish!: (state: OwnedGame) => void;
    storage.claimGame.mockReturnValueOnce(new Promise<OwnedGame>(resolve => { finish = resolve; }));
    const starting = session.start();
    await waitFor(() => expect(storage.claimGame).toHaveBeenCalledOnce());
    session.stop();
    finish(owned(session.owner));
    await expect(starting).rejects.toThrow();
    expect(session.view.game).toBeUndefined();
    await session.start();
    expect(session.view.controlled).toBe(true);
    expect(Storage.prototype.getItem).not.toHaveBeenCalled();
  });
});
