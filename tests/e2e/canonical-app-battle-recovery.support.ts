import { expect, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { appGame, installAutoKillCapture } from './canonical-app-auto-kill.support';

export async function isolate(context: BrowserContext, baseURL: string | undefined) {
  if (!baseURL) throw Error('Missing disposable fixture origin');
  const url = new URL(baseURL), denied: string[] = [];
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw Error('Expected local fixture origin');
  await context.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).origin === url.origin.replace(/^http:/, 'ws:')) socket.connectToServer();
    else { denied.push(socket.url()); socket.close(); }
  });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === url.origin) return route.continue();
    denied.push(route.request().url()); return route.abort();
  });
  await context.addInitScript(installAutoKillCapture, { seed: 781, origin: url.origin });
  return denied;
}

export async function capture(page: Page, info: TestInfo, name: string) {
  await info.attach(name, { contentType: 'application/json', body: JSON.stringify(await page.evaluate(() => window.autoKillEvidence)) });
  expect(await page.evaluate(() => window.autoKillEvidence.overflow)).toBe(false);
}

export async function head(page: Page) {
  return page.evaluate(async () => (await (await import('/src/persistence/canonical/read.ts')).readCanonicalHead()).head);
}

export async function startPaused(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Maze Battle', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Expedition settings', exact: true }).click();
  await page.getByRole('slider', { name: 'Auto throttle', exact: true }).fill('2000');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Waves', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Battle / })).toBeVisible();
  await page.getByRole('button', { name: 'Stop Waves', exact: true }).click();
  await expect.poll(async () => (await appGame(page)).battleAutomationPaused).toBe(true);
  const game = await appGame(page);
  expect(game.battle?.status).toBe('active');
  expect(game.inventory.gold).toBe(35);
  return game;
}

export async function stable(page: Page) {
  const before = await head(page);
  await page.waitForTimeout(2300); // Beyond the configured 2000ms throttle, without controlling the clock.
  expect(await head(page)).toEqual(before);
}

/** Labelled loss setup only: canonical actor delta, no raw IDB writes or battle/position/reward edits. */
export async function reduceHpToOne(page: Page) {
  return page.evaluate(async () => {
    const { readCanonicalHead } = await import('/src/persistence/canonical/read.ts');
    const { executeCanonical } = await import('/src/persistence/canonical/transaction.ts');
    const { gameRequest } = await import('/src/services/game/canonicalRequests.ts');
    const { gameCheckpoint, rosterContext } = await import('/src/persistence/canonical/game/checkpoint.ts');
    const { currentBattle } = await import('/src/persistence/canonical/combat/coherence.ts');
    const { loadRoster } = await import('/src/persistence/canonical/roster/projection.ts');
    const { saveRoster } = await import('/src/persistence/canonical/roster/write.ts');
    const original = (await readCanonicalHead()).head;
    return executeCanonical(gameRequest(original, 'fixture.loss-hp-only', { hp: 1 }), async tx => {
      const checkpoint = gameCheckpoint(tx.head.checkpoint), battle = await currentBattle(tx.pages, checkpoint);
      if (!battle?.paused || battle.battle.status !== 'active') throw Error('HP fixture requires a paused active battle');
      const before = await loadRoster(tx.pages, rosterContext(checkpoint));
      const state = structuredClone(before.state);
      state.party.forEach(actor => { actor.hp = 1; });
      await saveRoster(tx.pages, before, state);
      return { fixture: 'HP only: all three party members reduced to 1', battleId: battle.battle.id };
    });
  });
}

export async function win(page: Page) {
  // Spawn stays at 0.5; only combat resolution uses 0.9, including nonzero ordinary gold rolls.
  await page.evaluate(() => { Math.random = () => 0.9; });
  for (let i = 0; i < 60; i++) {
    const game = await appGame(page);
    if (!game.battle || game.battle.status !== 'active') break;
    await page.getByRole('button', { name: 'Round', exact: true }).click();
    await page.waitForTimeout(300);
  }
  const game = await appGame(page);
  expect(game.battle, 'Unmodified starting party must win within 60 public Round commands').toBeUndefined();
  expect(game.mode).toBe('manual');
  const message = game.activityLog.find(line => line.startsWith('Battle won. Rewards:'));
  const match = message?.match(/^Battle won\. Rewards: (\d+)g, (\d+) items\.$/);
  if (!match) throw Error(`Missing exact victory summary: ${message}`);
  const gold = Number(match[1]); expect(gold).toBeGreaterThan(0);
  return { game, gold, items: Number(match[2]) };
}
