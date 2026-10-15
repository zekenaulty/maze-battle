import { expect, test } from './canonical-manual-saves.test';

test('real GameSession capacity refusal retains control and permits delete then create', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.manualSaves, session = new c.GameSession(() => {});
    try {
      await session.start();
      for (let i = 0; i < c.MAX_MANUAL_SAVES; i++) await session.createManualSave();
      const before = await c.dump();
      const error = await session.createManualSave().then(() => 'accepted', String);
      await session.flush();
      const after = await c.dump(), refused = structuredClone(session.view);
      const deleted = session.view.saves[0].slotId;
      await session.removeSave(deleted);
      const remaining = session.view.saves.length;
      await session.createManualSave();
      return { before, after, error, refused: { controlled: refused.controlled, recovery: refused.recoveryRequired },
        remaining, count: session.view.saves.length, controlled: session.view.controlled,
        deleted: !session.view.saves.some(save => save.slotId === deleted) };
    } finally { session.stop(); }
  });
  expect(result.error).toContain('Manual save limit reached (16)');
  expect(result.after).toEqual(result.before);
  expect(result.refused).toEqual({ controlled: true, recovery: false });
  expect(result.remaining).toBe(15); expect(result.count).toBe(16);
  expect(result.controlled).toBe(true); expect(result.deleted).toBe(true);
});
