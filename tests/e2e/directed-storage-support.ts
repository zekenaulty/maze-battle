import { expect, type Page } from '@playwright/test';
import type {} from './directed-storage-fixture';

export async function openFixture(page: Page) {
  await page.addInitScript(() => {
    window.directedOpens = [];
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function(name, version) {
      window.directedOpens.push(name);
      if (name !== 'maze-battle-directed-v1') throw new Error(`Forbidden database: ${name}`);
      return open.call(this, name, version);
    };
    IDBFactory.prototype.deleteDatabase = () => { throw new Error('Database deletion forbidden'); };
  });
  await page.goto('/tests/e2e/directed-storage-fixture.html');
  await expect.poll(() => page.evaluate(() => !!window.directedStorage)).toBe(true);
}
