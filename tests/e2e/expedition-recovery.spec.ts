import { expect, test } from '@playwright/test';

test('reload cancels an uncommitted local reservation by its original ID and can continue', async ({ page }) => {
  await page.goto('/?expedition=1');
  await expect(page.locator('.expedition-screen')).toHaveAttribute('data-revision', '0');
  const request = await page.evaluate(async () => {
    const repo = await import('/src/persistence/expeditionActionRepository.ts');
    const owner = (await repo.loadExpeditionSession('structural-demo'))!;
    const request = { version: 1 as const, sessionId: owner.sessionId, epoch: owner.epoch, actionId: 'interrupted', expectedRevision: 0,
      command: { type: 'move' as const, direction: 'north' as const } };
    await repo.beginExpeditionAction('structural-demo', request);
    return request;
  });
  await page.reload();
  await expect(page.locator('.expedition-screen')).toHaveAttribute('data-revision', '0');
  const cancelled = await page.evaluate(async request => (await import('/src/persistence/expeditionActionRepository.ts')).loadExpeditionAction('structural-demo', request), request);
  expect(cancelled!.result.disposition).toBe('refused');
  expect(cancelled!.effect).toBeUndefined();
  await page.keyboard.press('w');
  await expect(page.locator('.expedition-screen')).toHaveAttribute('data-revision', '1');
  await page.reload();
  await expect(page.locator('.expedition-screen')).toHaveAttribute('data-revision', '1');
});

test('another tab fences the old browser controller before it can change the checkpoint', async ({ page, context }) => {
  await page.goto('/?expedition=1');
  await expect(page.locator('.expedition-screen')).toHaveAttribute('data-revision', '0');
  const next = await context.newPage();
  await next.goto('/?expedition=1');
  await expect(next.locator('.expedition-screen')).toHaveAttribute('data-revision', '0');
  await page.keyboard.press('w');
  await expect(page.getByRole('button', { name: 'Reload', exact: true })).toBeVisible();
  await expect(page.locator('.expedition-screen')).toHaveAttribute('data-revision', '0');
  await next.keyboard.press('w');
  await expect(next.locator('.expedition-screen')).toHaveAttribute('data-revision', '1');
});
