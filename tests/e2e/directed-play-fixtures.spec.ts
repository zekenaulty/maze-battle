import { expect, test } from '@playwright/test';
import { canTraverseDirected } from '../../src/domain/directed/world';
import { openFixture } from './directed-storage-support';

const slot = 'known-destination-proof-v1';

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`independent fixtures ${viewport.width}: honest labels, local activation and unchanged locked door`, async ({ page, context }, info) => {
    await page.setViewportSize(viewport);
    await page.goto('/?expedition=3');
    await expect(page.getByText(/F1 \/ Independent fixtures/)).toBeVisible();
    await expect(page.getByText('Standalone lever / no linked mechanism')).toBeVisible();
    const interact = page.getByRole('button', { name: 'Interact with destination' });
    await expect(interact).toBeDisabled();
    await page.getByRole('button', { name: 'Travel', exact: true }).click();
    await expect(page.locator('main')).toHaveAttribute('data-operation', 'running');
    await expect(page.locator('main')).toHaveAttribute('data-operation', 'arrived');
    await expect(interact).toBeEnabled();
    const inspector = await context.newPage(); await openFixture(inspector);
    const before = await inspector.evaluate(slot => window.directedStorage.auditDirectedSave(slot), slot);
    expect(before.session.actor.position).toEqual({ spaceId: 'L', row: 2, column: 3 });
    expect(before.session.world.features.V.state).toBe('idle');
    const doorway = { spaceId: 'H', row: 2, column: 3 };
    expect(canTraverseDirected(before.session.world, doorway, before.session.world.features.D.position)).toBe(false);
    await page.getByRole('tab', { name: 'Evidence' }).click();
    await page.getByText('Presented context', { exact: true }).click();
    const presentedBefore = await page.locator('.directed-evidence pre').textContent();
    await page.getByRole('tab', { name: 'Travel', exact: true }).click();
    await interact.click();
    await expect(page.getByText('Lever: active (current)')).toBeVisible();
    await expect(page.getByRole('status', { name: 'Travel status' })).toHaveText('Interaction performed.');
    await expect(interact).toBeDisabled();
    const after = await inspector.evaluate(slot => window.directedStorage.auditDirectedSave(slot), slot);
    expect(after.session.world.features.V.state).toBe('active');
    expect(after.session.world.features.D).toEqual(before.session.world.features.D);
    expect(after.session.knowledge.features.D).toEqual(before.session.knowledge.features.D);
    expect(after.events.slice(before.events.length)).toMatchObject([{ type: 'interact', subjectId: 'V', before: 'idle', after: 'active' }]);
    const newReceipts = after.receipts.filter(receipt => !before.receipts.some(old => old.request.attemptId === receipt.request.attemptId));
    expect(newReceipts).toMatchObject([{ request: { command: { type: 'interact', featureId: 'V' } },
      result: { status: 'applied', reason: 'Interaction performed.' } }]);
    expect(after.contexts.some(entry => entry.json === presentedBefore)).toBe(true);
    expect(canTraverseDirected(after.session.world, doorway, after.session.world.features.D.position)).toBe(false);
    await page.getByLabel('Destination', { exact: true }).selectOption('D');
    await expect(page.getByText('Blockage fixture / no unlocking mechanism')).toBeVisible();
    await expect(interact).toBeDisabled();
    await page.getByRole('button', { name: 'Travel', exact: true }).click();
    await expect(page.locator('main')).toHaveAttribute('data-operation', 'running');
    await expect(page.locator('main')).toHaveAttribute('data-operation', 'arrived');
    await expect(page.getByText('Locked Door: locked (current)')).toBeVisible();
    expect((await inspector.evaluate(slot => window.directedStorage.readDirectedSave(slot), slot))?.actor.position).toEqual(doorway);
    await expect(interact).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await page.locator('canvas').boundingBox())!.height).toBeGreaterThan(300);
    await page.screenshot({ path: info.outputPath(`independent-fixtures-${viewport.width}.png`) });
  });
}
