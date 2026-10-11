import { expect, test, type Page } from '@playwright/test';
import { openFixture } from './directed-storage-support';

const slot = 'known-destination-proof-v1';
const ownerKey = 'maze-directed-controller-v1';
const pendingKey = 'maze-directed-pending-v1';
const read = (inspector: Page) => inspector.evaluate(slot => window.directedStorage.readDirectedSave(slot), slot);

async function duplicate(page: Page) {
  const opened = page.waitForEvent('popup');
  // An opener copies sessionStorage, just as browser tab duplication does.
  await page.evaluate(() => window.open('/?expedition=3', '_blank'));
  const other = await opened;
  await expect(other.getByRole('heading', { name: 'Directed Expedition' })).toBeVisible();
  return other;
}

for (const command of ['step', 'cancel'] as const) {
  test(`a duplicated tab cannot recover a copied pending ${command} or inherit control`, async ({ page, context }) => {
    await page.goto('/?expedition=3');
    await page.getByRole('button', { name: 'Travel', exact: true }).click();
    await page.getByRole('button', { name: 'Pause travel' }).click();
    await expect(page.getByRole('status', { name: 'Travel status' })).toContainText('Travel paused');
    const inspector = await context.newPage(); await openFixture(inspector);
    const before = (await read(inspector))!;
    const request = { attemptId: `copied-${command}`, owner: before.owner!, epoch: before.epoch,
      expectedRevision: before.revision, command: command === 'step'
        ? { type: 'step', operationId: before.operation!.id, sequence: before.operation!.nextStep }
        : { type: 'cancel', operationId: before.operation!.id } };
    await page.evaluate(({ pendingKey, request }) => sessionStorage.setItem(pendingKey, JSON.stringify(request)), { pendingKey, request });
    const other = await duplicate(page);
    await expect(other.getByRole('button', { name: 'Take control' })).toBeEnabled();
    for (const name of ['Travel', 'Resume travel', 'Cancel travel', 'Look around', 'Interact with destination']) {
      await expect(other.getByRole('button', { name, exact: true })).toBeDisabled();
    }
    expect(await other.evaluate(key => sessionStorage.getItem(key), ownerKey)).not.toBe(before.owner);
    expect(await other.evaluate(key => sessionStorage.getItem(key), pendingKey)).toBeNull();
    expect(await read(inspector)).toEqual(before);
    expect(await page.evaluate(key => sessionStorage.getItem(key), pendingKey)).not.toBeNull();
    await page.evaluate(key => sessionStorage.removeItem(key), pendingKey);
    await other.reload();
    await expect(other.getByRole('button', { name: 'Take control' })).toBeEnabled();
    expect(await read(inspector)).toEqual(before);
    await other.getByRole('button', { name: 'Take control' }).click();
    await expect(other.locator('main')).toHaveAttribute('data-operation', 'cancelled');
    const taken = (await read(inspector))!;
    expect(taken.epoch).toBe(before.epoch + 1);
    expect(taken.actor).toEqual(before.actor);
    expect(taken.operation?.steps).toBe(before.operation?.steps);
    await page.getByRole('button', { name: 'Resume travel' }).click();
    await expect(page.getByRole('status', { name: 'Travel status' })).toContainText('Another controller owns this save');
    expect(await read(inspector)).toEqual(taken);
  });
}

test('without Web Locks a reload needs explicit takeover instead of trusting copied storage', async ({ page, context }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'locks', { value: undefined }));
  await page.goto('/?expedition=3');
  await expect(page.getByRole('button', { name: 'Travel', exact: true })).toBeEnabled();
  const owner = await page.evaluate(key => sessionStorage.getItem(key), ownerKey);
  const inspector = await context.newPage(); await openFixture(inspector);
  const before = await read(inspector);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Take control' })).toBeEnabled();
  expect(await page.evaluate(key => sessionStorage.getItem(key), ownerKey)).not.toBe(owner);
  expect(await read(inspector)).toEqual(before);
  await page.getByRole('button', { name: 'Take control' }).click();
  await expect(page.getByRole('button', { name: 'Travel', exact: true })).toBeEnabled();
});
