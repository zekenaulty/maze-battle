import { expect, test } from '@playwright/test';
import { appendFileSync, writeFileSync } from 'node:fs';
import { createInitialParty } from '../../src/domain/party/factory';
import type { CanonicalHead, CanonicalReceipt } from '../../src/persistence/canonical/types';
import { actionOf, appGame, operationOf } from './canonical-app-auto-kill.support';
import { drain, eventOf, installEnduranceCapture, isolate, policy, stable, storage, trace } from './canonical-app-auto-endurance.support';

test('fresh seed781 Auto explores later floors with explicit Stop reload resume within twenty minutes', async ({ page, context, baseURL }, info) => {
  test.setTimeout(1_200_000);
  const startedAt = Date.now(), deadline = startedAt + 1_140_000;
  const denied = await isolate(context, baseURL), errors: string[] = [];
  await context.addInitScript(installEnduranceCapture, { origin: new URL(baseURL!).origin });
  page.on('pageerror', error => errors.push(error.message));
  const rawPath = info.outputPath('commits.ndjson'), samplePath = info.outputPath('samples.ndjson');
  const heads = new Map<number, CanonicalHead>(), receipts: CanonicalReceipt[] = [], events: ReturnType<typeof eventOf>[] = [];
  const writes: Record<number, Awaited<ReturnType<typeof drain>>['writes']> = {}, seedCalls: Record<number, number> = {};
  const movesByFloor: Record<number, number> = {}, commands: Record<string, number> = {}, actions: Record<string, number> = {};
  let document = 0, resumed = false, backtrackSamples = 0, lastGame, initialStorage, finalStorage, tail;
  const collect = async () => {
    const chunk = await drain(page);
    appendFileSync(rawPath, `${JSON.stringify({ document, ...chunk })}\n`);
    expect(chunk.overflow).toBe(false);
    writes[document] = chunk.writes; seedCalls[document] = chunk.seedCalls;
    for (const h of chunk.heads) heads.set(h.revision, h);
    for (const receipt of chunk.receipts) {
      receipts.push(receipt);
      const op = operationOf(receipt); commands[op] = (commands[op] ?? 0) + 1;
      const action = actionOf(receipt);
      if (action) {
        const key = `${action.channel}.${action.kind}.${action.outcome ?? ''}`;
        actions[key] = (actions[key] ?? 0) + 1;
        if (action.kind === 'move' && action.moved === true) {
          const position = heads.get(receipt.afterRevision)?.checkpoint.position;
          if (!position || typeof position !== 'object' || Array.isArray(position) || typeof position.level !== 'number') throw Error('Missing committed move position');
          movesByFloor[position.level] = (movesByFloor[position.level] ?? 0) + 1;
        }
      }
    }
    events.push(...chunk.events.map(eventOf));
  };
  try {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Maze Battle', exact: true })).toBeVisible({ timeout: 60_000 });
    const initial = await appGame(page); initialStorage = await storage(page);
    expect(initial.party).toEqual(createInitialParty(initial.party[0].id.replace(/-warrior$/, '')));
    expect(initial.inventory).toMatchObject({ capacity: 36, gold: 35 }); expect(initial.stash.items).toEqual([]);
    expect(initial.inventory.items.map(i => i.baseId)).toEqual(['health-herb', 'mana-vial', 'town-portal']);
    expect(initial.quests).toEqual([]); expect(initial.autoThrottleMs).toBe(500); expect(initial.randomBattles).toBe(false);
    expect(initial.checkpoint.position).toMatchObject({ level: 1, cell: { spaceId: 'entry' } });
    await collect();
    await page.getByRole('button', { name: 'Auto', exact: true }).click();
    let revision = initial.snapshot.revision, lastProgress = Date.now();
    for (let sample = 0; Date.now() < deadline; sample++) {
      lastGame = await appGame(page); await collect();
      if (lastGame.snapshot.revision !== revision) { revision = lastGame.snapshot.revision; lastProgress = Date.now(); }
      const state = await policy(page);
      if (state?.route?.purpose === 'backtrack') backtrackSamples++;
      appendFileSync(samplePath, `${JSON.stringify({ elapsedMs: Date.now() - startedAt, game: lastGame, auto: state })}\n`);
      if (sample % 40 === 0) console.log(JSON.stringify({ elapsedMs: Date.now() - startedAt, revision, mode: lastGame.mode,
        position: lastGame.checkpoint.position, movesByFloor, reason: state?.reason,
        battle: lastGame.battle && { round: lastGame.battle.round, status: lastGame.battle.status },
        quests: lastGame.quests.map(q => ({ objective: q.task.objective, status: q.status, progress: q.task.progress })) }));
      expect(errors).toEqual([]); expect(denied).toEqual([]);
      expect(lastGame.battle?.status, 'ordinary party defeat is a real endurance failure').not.toBe('lost');
      expect(lastGame.mode, `Auto stopped: ${state?.reason}; ${lastGame.activityLog.join('; ')}`).not.toBe('manual');
      expect(state?.status, state?.reason).not.toBe('blocked');
      expect(Date.now() - lastProgress, 'No committed progress for 45s').toBeLessThan(45_000);
      if (!resumed && (movesByFloor[1] ?? 0) >= 128 && lastGame.mode === 'auto-play') {
        await page.getByRole('button', { name: 'Stop Auto', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Auto', exact: true })).toBeVisible();
        const stopped = await appGame(page); await stable(page); await collect();
        await page.screenshot({ path: info.outputPath('midjourney-stopped.png') });
        await page.reload(); document++;
        await expect(page.getByRole('heading', { name: 'Maze Battle', exact: true })).toBeVisible();
        const reloaded = await appGame(page);
        for (const field of ['id', 'party', 'inventory', 'stash', 'quests'] as const) expect(reloaded[field]).toEqual(stopped[field]);
        expect(reloaded.checkpoint.position).toEqual(stopped.checkpoint.position);
        expect(reloaded.mode).toBe('manual'); await stable(page); await collect();
        writeFileSync(info.outputPath('midjourney.json'), JSON.stringify({ stopped, reloaded }));
        await page.getByRole('button', { name: 'Auto', exact: true }).click();
        resumed = true; lastProgress = Date.now();
      }
      if ((movesByFloor[3] ?? 0) >= 16) break;
      await page.waitForTimeout(500);
    }
    await page.getByRole('button', { name: 'Stop Auto', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Auto', exact: true })).toBeVisible();
    await stable(page); await collect();
    lastGame = await appGame(page); finalStorage = await storage(page); tail = await trace(page);
    expect(resumed).toBe(true);
    expect(movesByFloor[2] ?? 0, 'Required: real floor-two exploration, not just stairs/retained setup').toBeGreaterThanOrEqual(16);
    expect(events.some(e => e.fact.kind === 'battle' && e.fact.event === 'won')).toBe(true);
    expect(events.some(e => e.fact.kind === 'reward' && e.fact.command === 'claim-quest')).toBe(true);
    expect(events.some(e => e.fact.kind === 'reward' && e.fact.command === 'open-chest')).toBe(true);
    expect(events.map(e => e.sequence)).toEqual(Array.from({ length: tail.sequence }, (_, i) => i + 1));
    expect(tail.events).toEqual(events.slice(-64));
    expect(new Set(receipts.map(r => r.attemptId)).size).toBe(receipts.length);
    expect(finalStorage.receipts).toBe(receipts.length);
    expect(finalStorage.head.quota.limitBytes).toBe(initialStorage.head.quota.limitBytes);
    expect(finalStorage.head.quota.reserveBytes).toBe(initialStorage.head.quota.reserveBytes);
    expect(finalStorage.head.quota.usedBytes).toBeGreaterThan(initialStorage.head.quota.usedBytes);
    expect(Object.values(seedCalls).reduce((n, v) => n + v, 0)).toBe(1);
  } finally {
    // Preserve the failure before an explicit safe Stop; never continue a failed game automatically.
    const failureState = { game: await appGame(page).catch(String), auto: await policy(page).catch(String) };
    await collect().catch(error => errors.push(`capture: ${String(error)}`));
    await page.screenshot({ path: info.outputPath('terminal-before-cleanup.png') }).catch(() => {});
    const stop = page.getByRole('button', { name: 'Stop Auto', exact: true });
    if (await stop.isVisible().catch(() => false)) await stop.click().catch(error => errors.push(`stop: ${String(error)}`));
    await collect().catch(error => errors.push(`capture: ${String(error)}`));
    finalStorage ??= await storage(page).catch(() => undefined); tail ??= await trace(page).catch(() => undefined);
    const summary = { runtime: 'ce935a307085bb6516fe170566ac25132f5a04a8', seed: 781, rng: 0.5,
      elapsedMs: Date.now() - startedAt, resumed, movesByFloor, commands, actions, events, backtrackSamples, seedCalls, writes,
      initialStorage, finalStorage, tail, lastGame, failureState, errors, denied };
    writeFileSync(info.outputPath('summary.json'), JSON.stringify(summary, null, 2));
    await info.attach('endurance-summary', { path: info.outputPath('summary.json'), contentType: 'application/json' });
  }
});
