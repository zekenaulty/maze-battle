import type { Page } from '@playwright/test';

export async function openImporter(page: Page) {
  await page.route('**/original-import-harness', (route) => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><html><head></head><body>Isolated original-save import test</body></html>',
  }));
  await page.goto('/original-import-harness');
}

export async function seedOriginal(page: Page, entries: Record<string, unknown>) {
  await page.evaluate((entries) => {
    localStorage.setItem('DC-GAME-SAVE-SLOTS', JSON.stringify(Object.keys(entries)));
    for (const [name, value] of Object.entries(entries)) {
      localStorage.setItem(`DC-GAME-${name.toUpperCase()}`, typeof value === 'string' ? value : JSON.stringify(value));
    }
  }, entries);
}

export function runImport(page: Page) {
  return page.evaluate(async () => (await import('/src/persistence/legacyLocalStorage.ts')).importLegacyLocalStorageSaves());
}

export function readStores(page: Page) {
  return page.evaluate(async () => {
    const db = await (await import('/src/persistence/saveRepository.ts')).getDatabase();
    const saves = await db.getAll('saves');
    const meta = await db.getAll('meta');
    return {
      saves,
      markers: meta.filter((entry) => entry.key.startsWith('original-save-v1:')).map((entry) => JSON.parse(entry.value)),
      storage: Object.fromEntries(Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).map((key) => [key, localStorage.getItem(key)])),
    };
  });
}

export async function installInterruption(page: Page, phase: string) {
  await page.evaluate((phase) => {
    const failure = () => { throw new DOMException(`Injected ${phase}`, 'QuotaExceededError'); };
    const add = IDBObjectStore.prototype.add;
    const get = IDBObjectStore.prototype.get;
    const put = IDBObjectStore.prototype.put;
    const remove = Storage.prototype.removeItem;
    IDBObjectStore.prototype.add = function (value, key) {
      if (this.name === 'meta' && value.key.startsWith('original-save-v1:')) {
        if (phase === 'before-commit') return failure();
        if (phase === 'abort-commit') {
          const request = add.call(this, value, key);
          this.transaction.abort();
          return request;
        }
      }
      if (phase === 'corrupt-readback' && this.name === 'saves') {
        value = structuredClone(value);
        value.game.inventory.gold++;
      }
      return add.call(this, value, key);
    };
    IDBObjectStore.prototype.get = function (query) {
      if (phase === 'after-commit' && this.name === 'saves' && this.transaction.mode === 'readonly') return failure();
      return get.call(this, query);
    };
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === 'meta' && value.key.startsWith('original-save-v1:')) {
        const marker = JSON.parse(value.value);
        if (phase === 'abort-verification' && marker.phase === 'verified') {
          const request = put.call(this, value, key);
          this.transaction.abort();
          return request;
        }
        if (phase === 'after-index-cleanup' && marker.phase === 'cleaned') return failure();
        if (phase === 'changed-source' && marker.phase === 'verified') {
          localStorage.setItem(marker.sourceKey, localStorage.getItem(marker.sourceKey) + '\n');
        }
      }
      return put.call(this, value, key);
    };
    Storage.prototype.removeItem = function (key) {
      if (phase === 'after-verification' && key === 'DC-GAME-ADVANCED') return failure();
      if (phase === 'after-source-deletion' && key === 'DC-GAME-SAVE-SLOTS') return failure();
      return remove.call(this, key);
    };
  }, phase);
}
