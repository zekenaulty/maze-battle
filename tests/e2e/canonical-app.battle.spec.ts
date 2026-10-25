import { expect, test, type Page } from '@playwright/test';

test.use({ actionTimeout: 10_000 });

async function state(page: Page) {
  return page.evaluate(async () => {
    const { readCanonical } = await import('/src/persistence/canonical/read.ts');
    const { projectGameSnapshot } = await import('/src/persistence/canonical/game/projection.ts');
    return (await readCanonical(projectGameSnapshot)).value;
  });
}
async function stable(page: Page) {
  const before = await state(page);
  await page.waitForTimeout(2300);
  expect((await state(page)).snapshot.revision).toBe(before.snapshot.revision);
}
async function startPaused(page: Page, query = '') {
  await page.goto(`/${query}`);
  await expect(page.getByRole('heading', { name: 'Maze Battle', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Expedition settings', exact: true }).click();
  await page.getByRole('slider', { name: 'Auto throttle', exact: true }).fill('2000');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Waves', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Battle / })).toBeVisible();
  await page.getByRole('button', { name: 'Stop Waves', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Waves', exact: true })).toBeVisible();
  const game = await state(page);
  expect(game.battle?.status).toBe('active'); expect(game.battleAutomationPaused).toBe(true);
  return game;
}

test('actual battle preserves skills, Stop, cooldown display, reload and return', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const started = await startPaused(page);
  const hero = started.party[0];
  const character = page.getByRole('article', { name: hero.displayName, exact: true });
  await stable(page);
  await character.getByRole('button', { name: 'Slash', exact: true }).click();
  await expect.poll(async () => (await state(page)).battle?.round).toBeGreaterThan(started.battle!.round);
  await expect(character.getByRole('button', { name: 'Slash', exact: true })).toBeEnabled({ timeout: 6000 });
  const afterSkill = await state(page);
  expect(afterSkill.party[0].skills.find(skill => skill.id === 'slash')?.cooldownUntil).toBeGreaterThan(0);
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await expect(page.getByLabel('Enemies', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`battle-${width}.png`) });
  }
  await page.reload();
  await expect(page.getByRole('heading', { name: /Battle / })).toBeVisible();
  const reloaded = await state(page);
  expect(reloaded.id).toBe(started.id); expect(reloaded.battle?.id).toBe(started.battle?.id);
  expect(reloaded.party).toEqual(afterSkill.party); expect(reloaded.battleAutomationPaused).toBe(true);
  await stable(page);
  await page.getByRole('button', { name: 'End', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Maze Battle', exact: true })).toBeVisible();
  expect((await state(page)).battle).toBeUndefined();
  expect(errors).toEqual([]);
});

test('actual battle rewards settle once and victory returns to exploration', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0.5; });
  const started = await startPaused(page);
  // Controlled RNG for a repeatable encounter; ordinary commands and unmodified party.
  for (let i = 0; i < 60; i++) {
    const game = await state(page);
    if (!game.battle || game.battle.status !== 'active') break;
    await page.getByRole('button', { name: 'Round', exact: true }).click();
    await page.waitForTimeout(300);
  }
  const result = await state(page);
  expect(result.battle, 'starting party should finish this floor-one battle').toBeUndefined();
  expect(result.mode).toBe('manual');
  // Gold is an existing chance-based drop, not a guaranteed reward per battle.
  const summary = result.activityLog.find(line => line.startsWith('Battle won. Rewards:'))!;
  expect(summary).toBeDefined();
  const gold = Number(summary.match(/Rewards: (\d+)g/)![1]);
  expect(result.inventory.gold).toBe(started.inventory.gold + gold);
  expect(result.party.some((actor, i) => actor.xp !== started.party[i].xp || actor.level > started.party[i].level)).toBe(true);
  await stable(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Maze Battle', exact: true })).toBeVisible();
  expect((await state(page)).inventory).toEqual(result.inventory);
  expect((await state(page)).party).toEqual(result.party);
});

test('returning from battle retains the chosen 3D projection', async ({ page }, info) => {
  await startPaused(page, '?view=stage3d');
  await page.getByRole('button', { name: 'End', exact: true }).click();
  await expect(page.getByRole('button', { name: '2D view', exact: true })).toBeVisible();
  await expect(page.locator('.canonical-3d canvas')).toBeVisible();
  await expect(page.getByText('3D view unavailable', { exact: false })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('battle-return-3d.png') });
});

test('battle dialog pauses ticks and reload needs explicit resume', async ({ page }) => {
  await startPaused(page);
  await page.getByRole('button', { name: 'Waves', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop Waves', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Battle settings', exact: true }).click();
  await stable(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Battle / })).toBeVisible();
  expect((await state(page)).battleAutomationPaused).toBe(true);
  await stable(page);
  const before = await state(page);
  await page.getByRole('button', { name: 'Auto', exact: true }).click();
  await expect.poll(async () => (await state(page)).battle?.round ?? 100, { timeout: 10_000 }).toBeGreaterThan(before.battle!.round);
  if ((await state(page)).battle) await page.getByRole('button', { name: 'Stop Auto', exact: true }).click();
});
