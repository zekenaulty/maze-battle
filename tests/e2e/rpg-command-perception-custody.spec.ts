import { test, expect, fixture } from './rpg-command-browser';
import type { GameSessionView } from '../../src/services/game/GameSession';
import type { SaveSlot } from '../../src/domain/types';

function matchesSlot(pair: { view: GameSessionView; slot?: SaveSlot }) {
  expect(pair.slot).toBeDefined();
  expect(pair.view.game).toEqual(pair.slot!.game);
  expect(pair.view.observationHead).toBe(pair.slot!.observationHead);
}

for (const town of [false, true]) test(`session claim, manual transition, load and ${town ? 'headless town' : 'observed'} replacement survive reload`, async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async town => {
    const h = window.rpgCommandTest, db = await h.repository.getDatabase();
    await h.repository.saveGame('auto', 'Session', 'auto', h.game());
    const session = new h.GameSession(() => {}); await session.start();
    const snapshot = async () => ({ view: structuredClone(session.view), slot: await db.get('saves', 'auto') });
    const claimed = await snapshot();
    await session.createManualSave();
    const manual = session.view.saves.find(s => s.kind === 'manual')!;
    session.transition(g => ({ ...g, maze: { ...g.maze, active: { row: 0, column: 4 } } }), { source: 'manual', action: 'move' });
    await session.flush();
    const moved = await snapshot();
    session.transition(g => ({ ...g, mode: 'town' }), { source: 'manual', action: 'town' });
    await session.flush();
    const inTown = await snapshot();
    await session.loadSave(manual.slotId);
    const loaded = await snapshot();
    await session.replaceGame({ ...h.game(), ...(town ? { mode: 'town' as const } : {}) });
    const replaced = await snapshot();
    const history = await h.history.readRpgHistory();
    session.stop();
    return { claimed, moved, inTown, loaded, replaced, history };
  }, town);
  for (const pair of [result.claimed, result.moved, result.inTown, result.loaded, result.replaced]) matchesSlot(pair);
  expect(result.claimed.view.observationHead).toEqual(expect.any(String));
  expect(result.moved.view.observationHead).not.toBe(result.claimed.view.observationHead);
  expect(result.inTown.view.observationHead).toBe(result.moved.view.observationHead);
  expect(result.loaded.view.observationHead).toBe(result.claimed.view.observationHead);
  expect(result.replaced.view.observationHead).not.toBe(result.claimed.view.observationHead);
  if (town) {
    expect(result.replaced.view.observationHead).toBeUndefined(); expect(result.history.records).toEqual([]);
  } else {
    expect(result.replaced.view.observationHead).toBe(result.history.snapshotId);
    expect(result.history.records[0].depth).toBe(1);
  }
  await page.reload(); await page.waitForFunction(() => !!window.rpgCommandTest);
  const reloaded = await page.evaluate(async () => {
    const h = window.rpgCommandTest, session = new h.GameSession(() => {}); await session.start();
    const pair = { view: structuredClone(session.view), slot: await (await h.repository.getDatabase()).get('saves', 'auto') };
    session.stop(); return pair;
  });
  matchesSlot(reloaded);
  expect(reloaded.view.game).toEqual(result.replaced.view.game);
  expect(reloaded.view.observationHead).toBe(result.replaced.view.observationHead);
});

test('read-only refresh and takeover keep the latest game/head paired and clear a replaced head', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgCommandTest, db = await h.repository.getDatabase();
    await h.repository.saveGame('auto', 'Session', 'auto', h.game());
    const first = new h.GameSession(() => {}), second = new h.GameSession(() => {});
    await first.start(); await second.start();
    const snapshot = async (session: typeof first) => ({ view: structuredClone(session.view), slot: await db.get('saves', 'auto') });
    const reader = await snapshot(second);
    first.transition(g => ({ ...g, maze: { ...g.maze, active: { row: 0, column: 2 } } }), { source: 'manual', action: 'move' });
    await first.flush(); await second.refresh();
    const refreshed = await snapshot(second);
    await second.takeControl();
    const taken = await snapshot(second);
    second.transition(g => ({ ...g, maze: { ...g.maze, active: { row: 0, column: 3 } } }), { source: 'manual', action: 'move' });
    await second.flush(); await first.refresh();
    const formerOwner = await snapshot(first);
    await second.replaceGame({ ...h.game(), mode: 'town' });
    await first.refresh();
    const cleared = await snapshot(first);
    first.stop(); second.stop();
    return { reader, refreshed, taken, formerOwner, cleared };
  });
  for (const pair of Object.values(result)) matchesSlot(pair);
  expect(result.reader.view.controlled).toBe(false);
  expect(result.refreshed.view.observationHead).not.toBe(result.reader.view.observationHead);
  expect(result.taken.view.controlled).toBe(true);
  expect(result.taken.view.observationHead).toBe(result.refreshed.view.observationHead);
  expect(result.formerOwner.view.controlled).toBe(false);
  expect(result.formerOwner.view.observationHead).not.toBe(result.taken.view.observationHead);
  expect(result.cleared.view.observationHead).toBeUndefined();
});

test('canonical command replay publishes the current game/head without rewriting the original result', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgCommandTest, db = await h.repository.getDatabase();
    await h.repository.saveGame('auto', 'Session', 'auto', h.game());
    const session = new h.GameSession(() => {}); await session.start();
    const snapshot = async () => ({ view: structuredClone(session.view), slot: await db.get('saves', 'auto') });
    const command = { type: 'move' as const, direction: 'east' as const, triggerStairs: false };
    const original = session.commandRequest(command), first = await session.executeCommand(original);
    const firstView = await snapshot();
    const current = await session.executeCommand(session.commandRequest(command)), currentView = await snapshot();
    const replay = await session.executeCommand(original), replayView = await snapshot();
    const refused = await session.executeCommand({ ...original, attemptId: 'stale-command' }), refusedView = await snapshot();
    await session.replaceGame({ ...h.game(), mode: 'town' });
    const headlessReplay = await session.executeCommand(original), headlessView = await snapshot();
    const retained = await h.commands.readGameCommand(original);
    session.stop();
    return { first, firstView, current, currentView, replay, replayView, refused, refusedView, headlessReplay, headlessView, retained };
  });
  for (const pair of [result.firstView, result.currentView, result.replayView, result.refusedView, result.headlessView]) matchesSlot(pair);
  expect(result.first.outcome).toEqual({ status: 'applied', reason: 'moved' });
  expect(result.first.observationHead).toBe(result.firstView.view.observationHead);
  expect(result.current.observationHead).toBe(result.currentView.view.observationHead);
  expect(result.current.observationHead).not.toBe(result.first.observationHead);
  expect(result.replay).toEqual(result.first); expect(result.retained).toEqual(result.first);
  expect(result.replayView.view.game).toEqual(result.currentView.view.game);
  expect(result.replayView.view.observationHead).toBe(result.current.observationHead);
  expect(result.refused.outcome).toEqual({ status: 'not-applied', reason: 'conflict' });
  expect(result.refused.observationHead).toBeUndefined();
  expect(result.refusedView.view.observationHead).toBe(result.current.observationHead);
  expect(result.headlessReplay).toEqual(result.first);
  expect(result.headlessView.view.observationHead).toBeUndefined();
});

test('travel replay uses the shared current-game projection without preparing memory', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgCommandTest, db = await h.repository.getDatabase();
    await h.repository.saveGame('auto', 'Session', 'auto', h.game());
    const session = new h.GameSession(() => {}); await session.start();
    const request = session.travelRequest('missing-journey', { type: 'cancel' });
    const first = await session.executeTravel(request), before = structuredClone(session.view);
    await session.executeCommand(session.commandRequest({ type: 'move', direction: 'east', triggerStairs: false }));
    const replay = await session.executeTravel(request);
    const pair = { view: structuredClone(session.view), slot: await db.get('saves', 'auto') };
    const memoryHeads = await db.count('rpgMemoryHeads');
    session.stop(); return { first, before, replay, pair, memoryHeads };
  });
  matchesSlot(result.pair);
  expect(result.first.disposition).toBe('refused'); expect(result.replay).toEqual(result.first);
  expect(result.pair.view.observationHead).not.toBe(result.before.observationHead);
  expect(result.memoryHeads).toBe(0);
});
