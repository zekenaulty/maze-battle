import { test, expect, seed } from './rpg-command-browser';
import type { RpgTravelRequest } from '../../src/persistence/rpgTravel/types';

test('command input is snapshotted before the first asynchronous boundary', async ({ page }) => {
  const request = await seed(page);
  const result = await page.evaluate(async request => {
    const h = window.rpgCommandTest, original = structuredClone(request);
    const pending = h.commands.executeOwnedGameCommand(request);
    request.command = { type: 'move', direction: 'west', triggerStairs: true };
    const committed = await pending, replay = await h.commands.executeOwnedGameCommand(original);
    return { committed, replay, position: (await h.custody.readGameControl()).game!.maze.active };
  }, request);
  expect(result.position.column).toBe(2); expect(result.replay.receipt).toEqual(result.committed.receipt);
});

for (const stage of ['start-technical', 'step-technical', 'step-cumulative', 'adopt-cumulative'] as const) {
  test(`${stage} expiry during the final receipt write aborts every staged effect`, async ({ page }) => {
    const base = await seed(page);
    const result = await page.evaluate(async ({ base, stage }) => {
      const h = window.rpgCommandTest; await h.memory.prepareRpgMemory();
      const original: RpgTravelRequest = { attemptId: 'start', operationId: 'final-deadline', gameId: base.gameId, control: base.control,
        deadlineAt: Date.now() + 120_000, action: { type: 'start', target: { floor: 1, row: 0, column: 5 },
          limits: { steps: 64, replans: 4, durationMs: 60_000 } } };
      let request = original, hardDeadline = Date.now() + 60_000;
      if (stage !== 'start-technical') {
        const start = await h.travel.executeRpgTravel(original); hardDeadline = start.receipt.travel!.operation.deadline!;
        request = { ...original, attemptId: 'late', control: start.receipt.travel!.control,
          action: stage === 'adopt-cumulative' ? { type: 'adopt' } : { type: 'step', sequence: 0 } };
      }
      const before = await h.custody.readGameControl(), travelBefore = await h.travel.readRpgTravel();
      const add = IDBObjectStore.prototype.add, now = Date.now;
      IDBObjectStore.prototype.add = function(...args) {
        const request = add.apply(this, args);
        if (this.name === 'rpgTravelActions') request.addEventListener('success', () => {
          Date.now = () => (stage.endsWith('technical') ? original.deadlineAt : hardDeadline) + 1;
        }, { once: true });
        return request;
      };
      let error = ''; try { await h.travel.executeRpgTravel(request); } catch (e) { error = String(e); }
      finally { IDBObjectStore.prototype.add = add; Date.now = now; }
      const db = await h.repository.getDatabase();
      return { error, before, travelBefore, after: await h.custody.readGameControl(), travelAfter: await h.travel.readRpgTravel(),
        receipt: await db.get('rpgTravelActions', request.attemptId), command: await db.get('gameCommands', request.attemptId) };
    }, { base, stage });
    expect(result.error).toContain('Invalid or unavailable RPG travel');
    expect(result.after).toEqual(result.before); expect(result.travelAfter).toEqual(result.travelBefore);
    expect(result.receipt).toBeUndefined(); expect(result.command).toBeUndefined();
  });
}
