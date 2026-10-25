import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { appGame } from './canonical-app-auto-kill.support';

// Seeded exit genesis only. All subsequent actions use the production App and native IndexedDB.
const canvas = (page: Page) => page.getByLabel('Explorable 3D dungeon', { exact: true });
const point = (value: string | null) => (value ?? '').split(',').map(Number);
async function ready(page: Page) {
  await page.goto('/tests/e2e/canonical-stairs.html?view=stage3d');
  await expect(canvas(page)).toBeVisible({ timeout: 60_000 });
  await expect(canvas(page)).toHaveAttribute('data-textures', 'ready');
  await expect.poll(async () => (await appGame(page)).spatial?.prepareDown, { timeout: 60_000 }).toBe(false);
  await expect.poll(async () => (await appGame(page)).spatial?.connectors?.some(c => c.travelReady), { timeout: 60_000 }).toBe(true);
}
async function stableActor(page: Page, milliseconds = 650) {
  const before = await appGame(page), pose = await canvas(page).getAttribute('data-pose');
  await page.waitForTimeout(milliseconds);
  expect((await appGame(page)).snapshot).toEqual(before.snapshot);
  expect(await canvas(page).getAttribute('data-pose')).toBe(pose);
}

test('3D movement encounter disposes input, End retains the selected view, and diagnostics export is pinned', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { if (location.origin === 'http://127.0.0.1:5210') Math.random = () => 0; });
  await ready(page);
  await page.getByRole('button', { name: 'Expedition settings', exact: true }).click();
  await page.getByRole('slider', { name: 'Auto throttle', exact: true }).fill('2000');
  await expect.poll(async () => (await appGame(page)).autoThrottleMs).toBe(2000);
  await page.getByRole('checkbox', { name: 'Encounters', exact: true }).click();
  await expect.poll(async () => (await appGame(page)).randomBattles).toBe(true);
  await expect(page.getByRole('checkbox', { name: 'Encounters', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  const before = await appGame(page), oldCanvas = await canvas(page).elementHandle();
  // Keep D held through battle and return. A newly mounted stage must require fresh input.
  await page.keyboard.down('d');
  await expect(page.getByRole('heading', { name: /^Battle / })).toBeVisible({ timeout: 10_000 });
  expect(await oldCanvas!.evaluate(c => c.isConnected)).toBe(false);
  const battle = await appGame(page);
  expect(battle.battle?.status).toBe('active'); expect(battle.mode).toBe('battle');
  expect(battle.checkpoint.position.cell.column).toBe(before.checkpoint.position.cell.column + 1);
  expect(battle.checkpoint.position.cell.spaceId).toBe(before.checkpoint.position.cell.spaceId);
  await page.getByRole('button', { name: 'Stop Auto', exact: true }).click();
  const paused = await appGame(page); expect(paused.battleAutomationPaused).toBe(true);
  await page.screenshot({ path: info.outputPath('movement-encounter-battle.png') });
  await page.getByRole('button', { name: 'End', exact: true }).click();
  await expect(canvas(page)).toBeVisible(); await expect(canvas(page)).toHaveAttribute('data-textures', 'ready');
  await expect(page.getByRole('button', { name: '2D view', exact: true })).toBeVisible();
  expect((await appGame(page)).battle).toBeUndefined();
  expect((await appGame(page)).checkpoint.position).toEqual(battle.checkpoint.position);
  await stableActor(page); await page.keyboard.up('d');
  await page.screenshot({ path: info.outputPath('encounter-return-3d.png') });

  const beforeDiagnostics = await appGame(page);
  await page.getByRole('button', { name: 'Diagnostics', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Storage', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('cell', { name: 'combat', exact: true }).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Gameplay', exact: true }).click();
  const trace = page.getByRole('region', { name: 'Gameplay trace', exact: true });
  await expect(trace).toHaveAttribute('aria-busy', 'false');
  await expect(trace.getByText(/Battle started/)).toBeVisible(); await expect(trace.getByText(/Battle abandoned/)).toBeVisible();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download gameplay trace', exact: true }).click();
  const download = await pending, file = info.outputPath(download.suggestedFilename()); await download.saveAs(file);
  const exported = JSON.parse(await readFile(file, 'utf8'));
  expect(exported.snapshot).toEqual(beforeDiagnostics.snapshot);
  expect(exported.events.some((e: { fact: { event: string } }) => e.fact.event === 'started')).toBe(true);
  expect(exported.events.some((e: { fact: { event: string } }) => e.fact.event === 'abandoned')).toBe(true);
  expect((await appGame(page)).snapshot).toEqual(beforeDiagnostics.snapshot);
  await page.screenshot({ path: info.outputPath('3d-gameplay-diagnostics.png') });
  await writeFile(info.outputPath('encounter-summary.json'), JSON.stringify({ before: before.checkpoint.position, battle: battle.battle?.id,
    origin: battle.checkpoint.position, returnPosition: beforeDiagnostics.checkpoint.position, exportedSnapshot: exported.snapshot,
    traceSequence: exported.sequence, errors }, null, 2));
  expect(errors).toEqual([]);
});

test('spatial flight disables Waves and external actions until Escape returns to the committed landing', async ({ page }, info) => {
  await ready(page); const before = await appGame(page), node = await canvas(page).elementHandle();
  await page.keyboard.down('w');
  await expect.poll(async () => Number(await canvas(page).getAttribute('data-stair-progress')), { intervals: [16] }).toBeGreaterThan(.12);
  await page.keyboard.up('w');
  expect(Number(await canvas(page).getAttribute('data-stair-progress'))).toBeLessThan(.5);
  for (const name of ['Waves', 'Auto', 'Party', 'Saves', 'Agentic play', 'Expedition settings'])
    await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^Portal \(/ })).toBeDisabled();
  await page.keyboard.press('i'); await page.keyboard.press('t'); await page.keyboard.press('m');
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByRole('heading', { name: /^Battle / })).toHaveCount(0);
  expect((await appGame(page)).snapshot).toEqual(before.snapshot);
  await page.screenshot({ path: info.outputPath('flight-external-actions-disabled.png') });
  await page.keyboard.press('Escape'); await expect(canvas(page)).toHaveAttribute('data-stair-progress', '');
  await expect(page.getByRole('button', { name: 'Waves', exact: true })).toBeEnabled();
  expect((await appGame(page)).checkpoint.position).toEqual(before.checkpoint.position);
  expect(await node!.evaluate(c => c.isConnected)).toBe(true);
  await page.screenshot({ path: info.outputPath('flight-escape-committed-landing.png') });
});

test('spatial Teleport refreshes the existing 3D renderer and party without held movement or resource drift', async ({ page }, info) => {
  await ready(page); const node = await canvas(page).elementHandle();
  await page.keyboard.down('d'); await page.waitForTimeout(90);
  await page.getByRole('button', { name: 'Party', exact: true }).click();
  const before = await appGame(page), mage = before.party.find(actor => actor.role === 'mage')!;
  await page.getByRole('group', { name: 'Character selection', exact: true }).getByRole('button', { name: new RegExp(mage.displayName) }).click();
  await page.getByRole('tab', { name: 'Skills', exact: true }).click();
  const cast = page.getByRole('button', { name: 'Cast Teleport', exact: true }); await expect(cast).toBeEnabled(); await cast.click();
  await expect.poll(async () => (await appGame(page)).checkpoint.position).not.toEqual(before.checkpoint.position);
  const after = await appGame(page), caster = after.party.find(actor => actor.id === mage.id)!;
  expect(after.checkpoint.position.level).toBe(before.checkpoint.position.level);
  expect(after.checkpoint.position.cell.spaceId).toBe(before.checkpoint.position.cell.spaceId);
  expect(after.observation?.header.actor).toEqual(after.checkpoint.position);
  expect(caster.mp).toBe(mage.mp - 20); expect(caster.skills.find(s => s.id === 'teleport')?.cooldownUntil).toBeGreaterThan(0);
  expect(after.inventory).toEqual(before.inventory); expect(after.quests).toEqual(before.quests);
  await expect(page.getByRole('dialog').getByRole('progressbar', { name: 'MP', exact: true })).toHaveAttribute('value', String(caster.mp));
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect.poll(async () => JSON.parse((await canvas(page).getAttribute('data-actor'))!)).toEqual([
    after.checkpoint.position.level, after.checkpoint.position.cell.spaceId, after.checkpoint.position.cell.row, after.checkpoint.position.cell.column]);
  const pose = point(await canvas(page).getAttribute('data-pose')), center = point(await canvas(page).getAttribute('data-center'));
  expect(Math.hypot(pose[0] - center[0], pose[1] - center[1])).toBeLessThan(.01);
  expect(await node!.evaluate(c => c.isConnected)).toBe(true); await stableActor(page); await page.keyboard.up('d');
  await page.screenshot({ path: info.outputPath('spatial-teleport-3d.png') });
  await page.reload(); await expect(canvas(page)).toBeVisible({ timeout: 60_000 });
  const restored = await appGame(page);
  expect(restored.checkpoint.position).toEqual(after.checkpoint.position); expect(restored.party).toEqual(after.party); expect(restored.inventory).toEqual(before.inventory);
});
