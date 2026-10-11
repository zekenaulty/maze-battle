import { test as base, expect, type Page } from '@playwright/test';
import type { GameCommandRequest } from '../../src/persistence/gameCommandTypes';
import type {} from './rpg-command-fixture';
export { expect };
export const test = base.extend<{ audit: void }>({
  audit: [async ({ page, context }, use, info) => {
    const errors: string[] = [], external: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === 'http://127.0.0.1:5204') return route.continue();
      external.push(route.request().url()); return route.abort();
    });
    await use();
    await info.attach('environment', { contentType: 'application/json', body: JSON.stringify({ errors, external, browser: context.browser()!.version() }) });
    expect(errors).toEqual([]); expect(external).toEqual([]);
  }, { auto: true }],
});
export async function fixture(page: Page) {
  await page.goto('/tests/e2e/rpg-command-fixture.html');
  await page.waitForFunction(() => !!window.rpgCommandTest);
}
export async function seed(page: Page): Promise<GameCommandRequest> {
  await fixture(page);
  return page.evaluate(async () => {
    const h = window.rpgCommandTest;
    await h.repository.saveGame('auto', 'Commands', 'auto', h.game());
    const state = await h.custody.claimGame('owner');
    return { attemptId: 'original', gameId: state.game.id, floor: 1, position: state.game.maze.active,
      control: state.control, deadlineAt: Date.now() + 120_000,
      command: { type: 'move' as const, direction: 'east' as const, triggerStairs: false } };
  });
}
