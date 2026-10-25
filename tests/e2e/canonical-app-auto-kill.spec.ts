import { expect, test } from '@playwright/test';
import { createInitialParty } from '../../src/domain/party/factory';
import { actionOf, appGame, installAutoKillCapture, operationOf, retainedAuto, snapshotAt } from './canonical-app-auto-kill.support';

test('fresh App Auto earns a kill objective, settles combat once and continues without another toggle', async ({ page, context, baseURL }, info) => {
  test.setTimeout(600_000);
  if (!baseURL) throw Error('The fresh-context fixture requires a configured loopback origin');
  const url = new URL(baseURL), origin = url.origin;
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw Error('Only a disposable loopback fixture is supported');
  const errors: string[] = [], network: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).origin === origin.replace(/^http:/, 'ws:')) socket.connectToServer();
    else { network.push(socket.url()); socket.close(); }
  });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    network.push(route.request().url()); return route.abort();
  });
  await page.addInitScript(installAutoKillCapture, { seed: 781, origin });
  try {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Maze Battle', exact: true })).toBeVisible({ timeout: 60_000 });
    const initial = await appGame(page);
    expect(initial.party).toEqual(createInitialParty(initial.party[0].id.replace(/-warrior$/, '')));
    expect(initial.inventory).toMatchObject({ capacity: 36, gold: 35 });
    expect(initial.inventory.items.map(i => i.baseId)).toEqual(['health-herb', 'mana-vial', 'town-portal']);
    expect(initial.stash.items).toEqual([]); expect(initial.quests).toEqual([]);
    expect(initial.checkpoint.position.cell.spaceId).toBe('entry'); expect(initial.randomBattles).toBe(false);
    expect(initial.autoThrottleMs).toBe(500);
    await page.getByRole('button', { name: 'Auto', exact: true }).click();

    let claimPosition: typeof initial.checkpoint.position | undefined, questId: string | undefined;
    let lastRevision = initial.snapshot.revision, lastProgress = Date.now(), sawBattle = false, continued = false;
    const deadline = Date.now() + 480_000;
    for (let sample = 0; Date.now() < deadline; sample++) {
      const game = await appGame(page);
      if (game.snapshot.revision !== lastRevision) { lastRevision = game.snapshot.revision; lastProgress = Date.now(); }
      if (sample % 20 === 0) console.log(JSON.stringify({ revision: lastRevision, mode: game.mode, at: game.checkpoint.position,
        battle: game.battle && { id: game.battle.id, round: game.battle.round, status: game.battle.status },
        quests: game.quests.map(q => ({ id: q.id, kind: q.task.objective, progress: q.task.progress, status: q.status })) }));
      expect(errors).toEqual([]);
      expect(game.battle?.status, 'Auto must not lose the ordinary-party journey').not.toBe('lost');
      expect(game.mode, game.activityLog.join('\n')).not.toBe('manual');
      expect(Date.now() - lastProgress, 'mounted Auto stopped making committed progress').toBeLessThan(30_000);
      if (!sawBattle && await page.locator('.battle-screen').isVisible()) {
        sawBattle = true;
        await page.screenshot({ path: info.outputPath('auto-selected-battle.png') });
      }
      const claimed = game.quests.find(q => q.task.objective === 'kill' && q.status === 'claimed');
      if (claimed && !claimPosition) { claimPosition = game.checkpoint.position; questId = claimed.id; }
      if (claimPosition && game.mode === 'auto-play' && JSON.stringify(game.checkpoint.position) !== JSON.stringify(claimPosition)) {
        continued = true; break;
      }
      await page.waitForTimeout(500);
    }
    expect(continued, 'kill claim plus actual subsequent Auto movement must fit the finite journey').toBe(true);
    expect(sawBattle).toBe(true);
    await page.getByRole('button', { name: 'Stop Auto', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Auto', exact: true })).toBeVisible();
    const stopped = await appGame(page), evidence = await page.evaluate(() => window.autoKillEvidence);
    expect(evidence.overflow).toBe(false); expect(evidence.seedCalls).toBe(1);
    const moves = evidence.receipts.filter(r => actionOf(r)?.kind === 'move' && actionOf(r)?.moved === true);
    expect(moves.length).toBeGreaterThan(0);
    const starts = evidence.receipts.filter(r => actionOf(r)?.channel === 'battle' && actionOf(r)?.kind === 'start');
    expect(starts.length).toBeGreaterThan(0);
    for (const start of starts) {
      const game = await appGame(page, snapshotAt(evidence, start.afterRevision));
      const auto = await retainedAuto(page, game.snapshot), quest = game.quests.find(q => q.id === auto?.objective?.id);
      expect(operationOf(start)).toBe('auto.command');
      expect(quest).toMatchObject({ id: questId, status: 'active', task: { objective: 'kill' }, targetRoomId: game.checkpoint.position.cell.spaceId });
      expect(game.battle).toMatchObject({ id: actionOf(start)?.battleId, returnMode: 'auto-play' });
      expect(game.observation?.header.actor).toEqual(game.checkpoint.position);
    }
    const victories = evidence.receipts.filter(r => operationOf(r) === 'battle.command').filter(r => {
      const before = snapshotAt(evidence, r.beforeRevision), after = snapshotAt(evidence, r.afterRevision);
      return before.checkpoint.mode === 'battle' && after.checkpoint.mode === 'auto-play';
    });
    expect(victories).toHaveLength(starts.length);
    for (const receipt of victories) {
      const before = await appGame(page, snapshotAt(evidence, receipt.beforeRevision));
      const after = await appGame(page, snapshotAt(evidence, receipt.afterRevision));
      expect(after.battle).toBeUndefined();
      const summary = after.activityLog[0].match(/^Battle won\. Rewards: (\d+)g, (\d+) items\.$/);
      expect(summary).not.toBeNull();
      expect(after.inventory.gold).toBe(before.inventory.gold + Number(summary![1]));
      const units = (items: typeof after.inventory.items) => items.reduce((n, item) => n + (item.quantity ?? 1), 0);
      expect(units(after.inventory.items) - units(before.inventory.items)).toBe(Number(summary![2]));
      expect(after.stash).toEqual(before.stash);
      expect(new Set(after.inventory.items.map(item => item.id)).size).toBe(after.inventory.items.length);
      expect(after.party.some((actor, i) => actor.xp > before.party[i].xp || actor.level > before.party[i].level)).toBe(true);
      const quest = after.quests.find(q => q.id === questId)!;
      const previous = before.quests.find(q => q.id === questId)!;
      const matching = before.battle!.enemies.filter(e => !quest.task.monsterTags?.length || quest.task.monsterTags.some(tag => e.tags.includes(tag)));
      expect(quest.task.progress).toBe(Math.min(quest.task.required, previous.task.progress + matching.length));
    }
    const claims = evidence.receipts.filter(r => actionOf(r)?.kind === 'claim-quest' && actionOf(r)?.questId === questId);
    expect(claims).toHaveLength(1);
    const beforeClaim = await appGame(page, snapshotAt(evidence, claims[0].beforeRevision));
    const afterClaim = await appGame(page, snapshotAt(evidence, claims[0].afterRevision));
    expect(beforeClaim.quests.find(q => q.id === questId)?.status).toBe('complete');
    expect(afterClaim.quests.find(q => q.id === questId)?.status).toBe('claimed');
    expect(afterClaim.inventory.gold).toBe(beforeClaim.inventory.gold + beforeClaim.quests.find(q => q.id === questId)!.reward.gold);
    expect(evidence.receipts.every(r => ['game.initialize', 'game.prepare', 'exploration.command', 'settings.command', 'auto.command', 'battle.command', 'control.takeover'].includes(operationOf(r)))).toBe(true);
    await info.attach('journey-summary', { body: JSON.stringify({ seed: 781, rng: 0.5, moves: moves.length, battles: starts.length,
      questId, initial, stopped }, null, 2), contentType: 'application/json' });
    await page.screenshot({ path: info.outputPath('continued-and-stopped.png') });
    await page.waitForTimeout(1600); expect((await appGame(page)).snapshot.revision).toBe(stopped.snapshot.revision);
    // Persist the original capture before reload starts a new document observer.
    await info.attach('committed-journey', { body: JSON.stringify(evidence), contentType: 'application/json' });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Maze Battle', exact: true })).toBeVisible();
    const reloaded = await appGame(page);
    for (const field of ['id', 'party', 'inventory', 'stash', 'quests'] as const) expect(reloaded[field]).toEqual(stopped[field]);
    expect(reloaded.checkpoint.position).toEqual(stopped.checkpoint.position); expect(reloaded.mode).toBe('manual');
    expect(errors).toEqual([]); expect(network).toEqual([]);
  } finally {
    await info.attach('last-committed-capture', { body: JSON.stringify(await page.evaluate(() => window.autoKillEvidence)), contentType: 'application/json' });
    await info.attach('browser-errors', { body: JSON.stringify({ errors, network }), contentType: 'application/json' });
  }
});
