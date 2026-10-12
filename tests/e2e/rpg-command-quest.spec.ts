import { test, expect, seed } from './rpg-command-browser';
import type {} from './rpg-quest-fixture';

async function setup(page: Parameters<typeof seed>[0], atChest = false) {
  const { control } = await seed(page);
  return page.evaluate(async ({ control, atChest }) => {
    window.rpgQuestTest = await import('/tests/e2e/rpg-quest-fixture.ts');
    return window.rpgQuestTest.install(control, atChest);
  }, { control, atChest });
}
test.afterEach(async ({ page }, info) => {
  const checks = await page.evaluate(() => window.rpgAgenticaActionsTest?.checks ?? []);
  await info.attach('quest-sdk-receipts', { body: JSON.stringify(checks), contentType: 'application/json' });
  for (const check of checks) {
    expect(check.sdkError).toBe('');
    expect(JSON.stringify(check.result)).not.toMatch(/private-quest-placement|Private target|targetRoomId|questId/);
  }
});

test('real return fails without the item, explicit chest action collects once, then return is host-proven', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const f = window.rpgQuestTest, h = window.rpgCommandTest;
    const early = await f.navigate(0), arrival = await f.navigate(2);
    const before = await h.custody.readGameControl(), open = await f.invoke('maze.open-chest', { chestId: 'chest-2' });
    const after = await h.custody.readGameControl(), again = await f.invoke('maze.open-chest', { chestId: 'chest-2' });
    const returned = await f.navigate(0), final = await h.custody.readGameControl();
    return { early, arrival, before, open, after, again, returned, final };
  });
  expect(result.early.kind).toBe('decision'); expect(result.early.completion).toBeUndefined();
  expect(result.arrival.kind).toBe('decision'); expect(result.before.game!.chests[0].opened).toBe(false);
  expect(result.open.result.disposition).toBe('applied'); expect(result.open.result.operation).toBeDefined();
  expect(result.open.result.observation!.data.quest).toMatchObject({ carried: 1, status: 'complete', complete: false });
  expect(result.after.game!.inventory.items.filter(i => i.category === 'quest')).toHaveLength(1);
  expect(result.again.result.disposition).toBe('refused');
  expect(result.returned.kind).toBe('completed'); expect(result.returned.observation.data.quest).toMatchObject({ carried: 1, complete: true });
  expect(result.final.game!.quests[0].status).toBe('complete'); expect(result.final.game!.inventory.gold).toBe(result.after.game!.inventory.gold);
  expect(result.final.game!.inventory).toEqual(result.after.game!.inventory);
});

test('chest command, quest item and exact SDK result survive reload and replay under new custody', async ({ page }) => {
  const binding = await setup(page, true);
  const original = await page.evaluate(async () => {
    const f = window.rpgQuestTest, open = await f.invoke('maze.open-chest', { chestId: 'chest-2' });
    return { open, state: await window.rpgAgenticaActionsTest.snapshot() };
  });
  await page.reload(); await page.waitForFunction(() => !!window.rpgCommandTest);
  const replay = await page.evaluate(async ({ binding, original }) => {
    const f = await import('/tests/e2e/rpg-quest-fixture.ts'); await f.connect(binding);
    const h = window.rpgAgenticaActionsTest, game = window.rpgCommandTest;
    await game.custody.claimGame('new-owner', true);
    const before = await h.snapshot(), now = Date.now;
    Date.now = () => Date.parse(original.action.deadlineAt) + 1;
    try { return { first: await h.executeRpgAction(original.action), before, after: await h.snapshot() }; }
    finally { Date.now = now; }
  }, { binding, original: original.open });
  expect(replay.first.replayed).toBe(true); expect(replay.first.result).toEqual(original.open.result);
  expect(replay.after).toEqual(replay.before);
  expect(replay.first.current).toMatchObject({ game: { quests: [{ task: { item: { baseId: 'survey-seal' } } }] } });
});

for (const chestId of ['chest-2', 'hidden-chest', 'missing-chest']) {
  test(`no remote or guessed interaction oracle: ${chestId}`, async ({ page }) => {
    await setup(page);
    const result = await page.evaluate(async chestId => {
      const h = window.rpgAgenticaActionsTest, before = await h.snapshot(false);
      const result = await window.rpgQuestTest.invoke('maze.open-chest', { chestId });
      return { before, result, after: await h.snapshot(false) };
    }, chestId);
    expect(result.result.result).toMatchObject({ disposition: 'refused', summary: 'No eligible observed chest at the current cell.' });
    expect(result.after).toEqual(result.before);
  });
}

for (const condition of ['stale-revision', 'takeover', 'expired', 'settled']) {
  test(`${condition} cannot collect a quest item`, async ({ page }) => {
    await setup(page, true);
    const result = await page.evaluate(async condition => {
      const f = window.rpgQuestTest, h = window.rpgAgenticaActionsTest, game = window.rpgCommandTest;
      const action = await f.request('maze.open-chest', { chestId: 'chest-2' });
      if (condition === 'expired') action.deadlineAt = '2000-01-01T00:00:00Z';
      await h.reserve(action);
      if (condition === 'takeover') await game.custody.claimGame('new-owner', true);
      if (condition === 'stale-revision') {
        const current = await game.custody.readGameControl();
        await game.custody.updateOwnedGame(current.control!, g => ({ ...g, facing: 'south' }));
      }
      const before = await h.snapshot(false), first = await h.executeRpgAction(action, condition === 'settled');
      return { before, first, after: await h.snapshot(false), replay: await h.executeRpgAction(action) };
    }, condition);
    expect(result.first.result.disposition).not.toBe('applied'); expect(result.after).toEqual(result.before);
    expect(result.replay.result).toEqual(result.first.result);
  });
}

for (const [store, method] of [['gameCommands', 'add'], ['rpgAgenticaActions', 'put'],
  ['rpgAgenticaOperations', 'add'], ['rpgAgenticaEvents', 'add']] as const) {
  for (const expire of [false, true]) {
    test(`${store} ${expire ? 'deadline' : 'storage failure'} rolls back all chest effects`, async ({ page }) => {
      await setup(page, true);
      const result = await page.evaluate(async ({ store, method, expire }) => {
        const h = window.rpgAgenticaActionsTest, action = await window.rpgQuestTest.request('maze.open-chest', { chestId: 'chest-2' });
        await h.reserve(action);
        const before = await h.snapshot(), fault = await h.fault(action, store, method, expire);
        return { before, fault, after: await h.snapshot(), retry: await h.executeRpgAction(action) };
      }, { store, method, expire });
      expect(result.fault.hits).toBeGreaterThan(0); expect(result.fault.error).not.toBe('');
      expect(result.after).toEqual(result.before); expect(result.retry.result.disposition).toBe('applied');
    });
  }
}

test('retrieval launch exposes safe accepted objective and known entrance, not private placement', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const h = window.rpgCommandTest, f = window.rpgQuestTest, current = await h.custody.readGameControl();
    const options = { url: 'ws://127.0.0.1:5092/api/host', mode: 'quest' as const, questId: 'private-quest-placement',
      target: { floor: 1, row: 0, column: 0 } };
    const errors: string[] = [];
    for (const change of [{ questId: 'unaccepted' }, { target: { floor: 1, row: 0, column: 2 } }]) {
      try { await f.prepareRpgLaunch(current.control!, { ...options, ...change }); } catch (e) { errors.push(String(e)); }
    }
    return { errors, launch: await f.prepareRpgLaunch(current.control!, options) };
  });
  expect(result.errors).toHaveLength(2);
  expect(result.launch.request.observation.data.quest).toMatchObject({ carried: 0, complete: false, item: { name: 'Survey Seal' } });
  expect(result.launch.request.capabilities.map(c => c.id)).toContain('maze.open-chest');
  expect(JSON.stringify(result.launch.request)).not.toMatch(/private-quest-placement|Private target|targetRoomId|questId/);
});

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`actual App retrieval selector fits ${viewport.width}px without starting a provider`, async ({ page }, info) => {
    await page.setViewportSize(viewport); await setup(page);
    await page.evaluate(async () => {
      const root = document.createElement('div'); root.id = 'root'; document.body.append(root);
      await import('/src/main.tsx');
    });
    await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Agentic play' });
    await dialog.getByRole('radio', { name: 'Retrieve quest item' }).check();
    await expect(dialog.getByRole('button', { name: 'Start', exact: true })).toBeDisabled();
    await dialog.getByRole('combobox', { name: 'Accepted fetch quest' }).selectOption('private-quest-placement');
    await expect(dialog.getByRole('button', { name: 'Start', exact: true })).toBeEnabled();
    const bounds = await dialog.boundingBox(), select = await dialog.getByRole('combobox').boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(select!.x).toBeGreaterThanOrEqual(bounds!.x); expect(select!.x + select!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
    await page.screenshot({ path: info.outputPath(`retrieval-${viewport.width}.png`) });
    await expect(dialog.getByRole('status')).toHaveCount(0);
  });
}
