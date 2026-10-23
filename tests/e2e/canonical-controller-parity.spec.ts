import { test, expect } from '@playwright/test';
import type { audit } from './canonical-controller-parity.audit';
import { key, type earnChest } from './canonical-controller-parity.setup';
import { inventoryConserved, reloadPreserved } from './canonical-controller-parity.assertions';

type State = Awaited<ReturnType<typeof audit>>;
type Setup = Awaited<ReturnType<typeof earnChest>>;
function noContentEffects(before: State, after: State) {
  for (const field of ['chest', 'contracts', 'quests', 'records', 'party', 'inventory', 'stash', 'policy'] as const)
    expect(after[field], field).toEqual(before[field]);
  expect(after.checkpoint.position.level).toBe(1);
  expect(after.checkpoint.mode).not.toBe('town'); expect(after.checkpoint.townReturnMode).toBeUndefined();
  expect(after.checkpoint.activityLog).toEqual(before.checkpoint.activityLog);
}
function collectedOnce(before: State, after: State, setup: Setup) {
  expect(before.chest.chest.opened).toBe(false); expect(after.chest.chest.opened).toBe(true);
  const loot = after.chest.chest.loot!;
  expect(loot.length).toBeGreaterThan(0);
  inventoryConserved(before.inventory, after.inventory, loot);
  expect(after.inventory.gold).toBe(before.inventory.gold); expect(after.stash).toEqual(before.stash);
  expect(after.party).toEqual(before.party); expect(after.policy).toEqual(before.policy);
  expect(after.contracts).toEqual(before.contracts);
  const questId = setup.offers.find(c => c.objective === 'fetch')!.id;
  expect(before.quests.find(q => q!.quest.id === questId)).toMatchObject({ quest: { status: 'active', task: { progress: 0 } }, award: null });
  const quest = after.quests.find(q => q!.quest.id === questId)!;
  expect(quest.quest).toMatchObject({ status: 'complete', task: { progress: 1 } }); expect(quest.award!.chestId).toBe(setup.chestId);
  expect(after.inventory.items.filter(item => item.questId === questId)).toHaveLength(1);
  expect(after.inventory.items.find(item => item.id === quest.award!.itemId)?.questId).toBe(questId);
  expect(after.quests.filter(q => q!.quest.id !== questId)).toEqual(before.quests.filter(q => q!.quest.id !== questId));
  expect(after.checkpoint.position).toEqual(setup.target); expect(after.checkpoint.mode).not.toBe('town');
  expect(after.checkpoint.knowledge!.sequence).toBe(before.checkpoint.knowledge!.sequence + 1);
  expect(after.head.revision).toBeGreaterThan(before.head.revision);
  expect(after.head.roots.world).not.toBe(before.head.roots.world);
}

test('Manual hook, Auto policy scheduler and offline-admitted Agentica driver preserve chest effect boundaries', async ({ browser }, info) => {
  const summaries = [];
  for (const kind of ['manual', 'auto', 'agentica'] as const) {
    const context = await browser.newContext({ serviceWorkers: 'block' }), page = await context.newPage();
    try {
      // This fixture has no permitted remote endpoint. Requests are retained by Playwright on failure.
      await context.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5466'
        ? route.continue() : route.abort('blockedbyclient'));
      await page.goto('http://127.0.0.1:5466/tests/e2e/canonical-controller-parity.html');
      await page.waitForFunction(() => !!window.canonicalControllerParity);
      const boot = await page.evaluate(() => window.canonicalControllerParity.boot()), { setup } = boot;
      await info.attach(`${kind}-setup.json`, { body: JSON.stringify(boot), contentType: 'application/json' });
      expect(setup.moves.length).toBeLessThanOrEqual(64); expect(setup.route).toHaveLength(2);
      expect(setup.route[0].from).toEqual(setup.start); expect(setup.route[1].to).toEqual(setup.target);
      for (const step of setup.route) expect(setup.sight!.cells.find(c => key(c.at) === key(step.from))!.edges[step.direction])
        .toEqual(step.to);
      expect(setup.sight!.cells.find(c => key(c.at) === key(setup.target))!.chests)
        .toContainEqual({ id: setup.chestId, opened: false });
      expect(boot.before.quests).toHaveLength(2);
      expect(boot.before.quests.every(q => q?.quest.status === 'active')).toBe(true);
      let replayInput: Parameters<Window['canonicalControllerParity']['reloadReplay']>[0];
      let opened: State, stopped: State;
      if (kind !== 'agentica') {
        const r = await page.evaluate(kind => window.canonicalControllerParity.direct(kind), kind);
        await info.attach(`${kind}-effects.json`, { body: JSON.stringify(r), contentType: 'application/json' });
        expect(r.navigation).toHaveLength(2);
        for (const [i, step] of r.navigation.entries()) {
          noContentEffects(r.before, step.state);
          expect(step.state.checkpoint.position).toEqual(setup.route[i].to);
          expect(step.state.checkpoint.knowledge!.sequence).toBe(r.before.checkpoint.knowledge!.sequence + i + 1);
          expect(step.state.head.revision).toBeGreaterThan(r.before.head.revision);
          expect(step.receipt.result).toMatchObject(kind === 'auto'
            ? { action: { kind: 'move', channel: 'exploration', moved: true }, reason: 'Following an earned waypoint route.' }
            : { kind: 'move', moved: true });
        }
        if (kind === 'manual') expect(r.arrived.head.roots.world).toBe(r.before.head.roots.world);
        expect(r.arrived.checkpoint.position).toEqual(setup.target);
        expect(r.original.result).toMatchObject(kind === 'auto'
          ? { action: { kind: 'open-chest', channel: 'content', outcome: 'applied' }, reason: 'Explicitly collected a chest on route.' }
          : { kind: 'open-chest', outcome: 'applied' });
        collectedOnce(r.arrived, r.opened, setup); expect(r.replay).toEqual(r.original); expect(r.repeated).toEqual(r.opened);
        if (kind === 'manual') {
          expect(r.second!.result).toMatchObject({ kind: 'open-chest', outcome: 'unchanged', lootIds: [] });
          noContentEffects(r.opened, r.afterSecond);
        } else expect(r.afterSecond).toEqual(r.opened);
        expect(r.stopped.head.quota.reservations).toBe(0); expect(r.stopped.checkpoint.mode).toBe('manual');
        replayInput = { setup, receipt: r.original }; opened = r.opened; stopped = r.stopped;
      } else {
        const r = await page.evaluate(() => window.canonicalControllerParity.agent());
        await info.attach('agentica-effects.json', { body: JSON.stringify(r), contentType: 'application/json' });
        noContentEffects(r.before, r.navigation.admitted);
        expect(r.navigation.effects).toHaveLength(2);
        for (const [i, state] of r.navigation.effects.entries()) {
          noContentEffects(r.before, state); expect(state.checkpoint.position).toEqual(setup.route[i].to);
          expect(state.checkpoint.knowledge!.sequence).toBe(r.before.checkpoint.knowledge!.sequence + i + 1);
        }
        noContentEffects(r.before, r.arrival); expect(r.arrival.checkpoint.position).toEqual(setup.target);
        expect(r.arrival.head.roots.world).toBe(r.before.head.roots.world);
        expect(r.navigation.actions.map(a => a.action.capabilityId)).toEqual(['maze.navigate']);
        expect(r.navigation.original.action.arguments).toEqual({ level: setup.target.level, ...setup.target.cell });
        expect(r.interaction.actions.map(a => a.action.capabilityId)).toEqual(['maze.inspect', 'maze.interact']);
        const inspected = r.interaction.actions[0].result.observation!.data.cell as { chests: { target?: string }[] };
        expect(r.interaction.original.action.arguments).toEqual({ target: inspected.chests[0].target });
        expect(inspected.chests[0].target).not.toContain(setup.chestId);
        noContentEffects(r.arrival, r.interaction.admitted);
        expect(r.interaction.effects).toHaveLength(1); collectedOnce(r.arrival, r.interaction.after, setup);
        for (const window of [r.navigation, r.interaction]) {
          expect(Buffer.byteLength(JSON.stringify(window.funded.start))).toBeLessThanOrEqual(3584);
          for (const { result } of window.actions) {
            expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(4096);
            expect(Buffer.byteLength(JSON.stringify(result.observation))).toBeLessThanOrEqual(2800);
          }
          expect(window.replay).toEqual(window.effect.outcome.receipt); expect(window.replayAfter).toEqual(window.replayBefore);
          expect(window.peer.state).toBe('cancelled'); expect(window.peer.usage.providerCalls).toBe(0);
          expect(window.stopPulses.at(-1)).toMatchObject({ status: 'terminal-acknowledged' });
          expect(window.stopped.head.quota.reservations).toBe(0);
          noContentEffects(window.after, window.stopped);
        }
        replayInput = { setup, agent: { binding: r.interaction.binding, original: r.interaction.original } }; opened = r.interaction.after; stopped = r.stopped;
      }
      await page.evaluate(() => window.canonicalControllerParity.stop()); await page.reload();
      await page.waitForFunction(() => !!window.canonicalControllerParity);
      const replay = await page.evaluate(serialized => window.canonicalControllerParity.reloadReplay(JSON.parse(serialized)), JSON.stringify(replayInput));
      await info.attach(`${kind}-reload-replay.json`, { body: JSON.stringify(replay), contentType: 'application/json' });
      reloadPreserved(stopped.head, replay.persisted.head, replay.before.head);
      expect(replay.before.checkpoint).toEqual(stopped.checkpoint); noContentEffects(stopped, replay.before);
      expect(replay.after).toEqual(replay.before); noContentEffects(opened, replay.after);
      if (replayInput.agent) {
        const result = replay.result as { repeated: unknown; loaded: { result: unknown }; reconciled: unknown };
        expect(result.repeated).toEqual(replayInput.agent.original.result);
        expect(result.loaded.result).toEqual(result.repeated); expect(result.reconciled).toEqual(result.repeated);
      } else expect(replay.result).toEqual(replayInput.receipt);
      summaries.push({ kind, start: setup.start, target: setup.target, steps: setup.route.length,
        opened: opened.chest.chest.opened, statuses: opened.quests.map(q => q!.quest.status),
        gold: opened.inventory.gold, questItems: opened.inventory.items.filter(item => item.questId).length,
        reservations: replay.after.head.quota.reservations });
      await page.evaluate(() => window.canonicalControllerParity.stop());
    } finally { await context.close(); }
  }
  await info.attach('controller-domain-parity.json', { body: JSON.stringify(summaries), contentType: 'application/json' });
  const effects = summaries.map(({ kind: _kind, ...value }) => value);
  expect(effects).toEqual([effects[0], effects[0], effects[0]]);
});
