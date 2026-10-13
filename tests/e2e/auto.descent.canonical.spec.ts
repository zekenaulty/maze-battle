import { test, expect } from '@playwright/test';
import type {} from './canonical-auto.fixture';

test('Auto prepares one bounded batch, can stop, resumes identical preparation and deliberately descends', async ({ page }) => {
  await page.goto('/tests/e2e/canonical-auto.fixture.html'); await page.waitForFunction(() => !!window.canonicalAuto);
  const result = await page.evaluate(async () => {
    const a = window.canonicalAuto;
    const { loadFloor, json } = await import('../../src/persistence/canonical/world/records.ts');
    const { initialAutoState, saveAutoState } = await import('../../src/persistence/canonical/auto/records.ts');
    const { recordGameObservation } = await import('../../src/persistence/canonical/knowledge/write.ts');
    const { findPreparation } = await import('../../src/persistence/canonical/game/preparation.ts');
    await a.seed();
    // Fixture: completed noncombat floor at its observed exit. This is not a route-planning proof.
    await a.executeCanonical(a.worldRequest((await a.readCanonicalHead()).head, 'fixture.completed-floor'), async tx => {
      const old = a.roster.gameCheckpoint(tx.head.checkpoint), floor = await loadFloor(tx.pages, 1);
      const offers = await tx.pages.scan('world', 'contracts/1/', undefined, 16);
      if (offers.next) throw Error('Fixture must not omit offers');
      for (const offer of offers.rows) await tx.pages.delete('world', offer.key);
      const c = await recordGameObservation(tx, { ...old, position: { level: 1, cell: floor.exit! } });
      tx.setCheckpoint(a.roster.checkpointJson(c));
      const state = initialAutoState(c, tx.head.revision + 1);
      state.completed = true; state.descent = c.position;
      state.objective = { kind: 'exit', id: 'exit:1', roomId: c.position.cell.spaceId };
      await saveAutoState(tx.pages, state); return json({});
    });
    const first = await a.act(), one = (await a.readCanonical(async (p, s) => ({ floor: await loadFloor(p, 2),
      phase: await findPreparation(p, 2), c: a.roster.gameCheckpoint(s.checkpoint) }))).value;
    const replay = await a.act(first.request);
    await a.enabled(false);
    const stopped = await a.act(), paused = (await a.readCanonical(p => loadFloor(p, 2))).value;
    // Manual stairs must recognize a partially prepared floor instead of loading incomplete content.
    const manual = await a.knowledge.act({ kind: 'stairs', direction: 'down' });
    await a.enabled(true);
    const phases = new Set<string>(), costs = [];
    for (let i = 0; i < 100; i++) {
      const step = await a.act(), current = (await a.read()).value.checkpoint;
      costs.push(step.outcome.stats);
      phases.add((await a.readCanonical(p => findPreparation(p, 2))).value!);
      if (current.position.level === 2) return { first: first.outcome.receipt, replay: replay.outcome,
        stopped: stopped.outcome.receipt, one, paused, manual: manual.outcome.receipt,
        phases: [...phases], steps: i + 1, costs, current };
    }
    throw Error('Preparation did not finish within the qualification bound');
  });
  expect(result.one.c.position.level).toBe(1); expect(result.one.phase).toBe('generation');
  expect(result.paused).toEqual(result.one.floor);
  expect(result.replay.replayed).toBe(true); expect(result.replay.receipt).toEqual(result.first);
  expect(result.stopped.result).toMatchObject({ outcome: 'paused' });
  expect(result.manual.result).toMatchObject({ needsFloor: 2, moved: false });
  expect(result.phases).toEqual(expect.arrayContaining(['quality', 'roles', 'content', 'ready']));
  expect(result.current.mode).toBe('auto-play'); expect(result.current.position.level).toBe(2);
  console.info('CANONICAL_AUTO_DESCENT', JSON.stringify({ batches: result.steps,
    maxReads: Math.max(...result.costs.map(c => c.reads)), maxWrites: Math.max(...result.costs.map(c => c.writes)),
    maxWriteBytes: Math.max(...result.costs.map(c => c.writeBytes)) }));
});
