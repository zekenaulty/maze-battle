import { expect, test } from '@playwright/test';
import { appGame } from './canonical-app-auto-kill.support';

test('character-sheet Teleport updates the real party and position without using a portal scroll', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Maze Battle', exact: true })).toBeVisible();
  const before = await appGame(page), mage = before.party.find(actor => actor.role === 'mage')!;
  await page.getByRole('button', { name: 'Party', exact: true }).click();
  await page.getByRole('group', { name: 'Character selection', exact: true }).getByRole('button', { name: new RegExp(mage.displayName) }).click();
  await page.getByRole('tab', { name: 'Skills', exact: true }).click();
  const cast = page.getByRole('button', { name: 'Cast Teleport', exact: true });
  await expect(cast).toBeEnabled(); await cast.click();
  await expect.poll(async () => (await appGame(page)).checkpoint.position).not.toEqual(before.checkpoint.position);
  const after = await appGame(page), caster = after.party.find(actor => actor.id === mage.id)!;
  expect(after.checkpoint.position.level).toBe(before.checkpoint.position.level);
  expect(after.checkpoint.position.cell.spaceId).toBe(before.checkpoint.position.cell.spaceId);
  expect(caster.mp).toBe(mage.mp - 20);
  await expect(page.getByRole('dialog').getByRole('progressbar', { name: 'MP', exact: true })).toHaveAttribute('value', String(caster.mp));
  expect(after.inventory).toEqual(before.inventory); expect(after.quests).toEqual(before.quests);
  expect(after.observation?.header.actor).toEqual(after.checkpoint.position);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Maze Battle', exact: true })).toBeVisible();
  const reloaded = await appGame(page);
  expect(reloaded.checkpoint.position).toEqual(after.checkpoint.position);
  expect(reloaded.party).toEqual(after.party); expect(reloaded.inventory).toEqual(before.inventory);
});
