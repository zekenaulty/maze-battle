import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

// UI-only quote fixtures: this does not simulate or qualify domain inventory mutations.
const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = `${root}/test-results/stack-sales`;
const virtualId = 'virtual:stack-sales-check';
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Dialog } from '/src/components/Dialog.tsx';
import { StackSellControls } from '/src/components/characters/StackSellControls.tsx';
import { itemFixture } from '/src/viewModels/characterTestFixtures.ts';
import '/src/styles.css';
import '/src/components/characters/characters.css';
const h = React.createElement;
const root = createRoot(document.getElementById('root'));
const prices = new Map([[1, 4], [2, 7], [3, 11], [4, 14], [5, 18], [12345, 98765]]);
window.sales = [];
window.renderSale = (quantity = 5, locked = false) => {
  const item = itemFixture({ id: 'herb', displayName: 'Health Herb', category: 'consumable', slot: undefined, quantity, locked });
  root.render(h(Dialog, { title: 'Characters', onClose() {} },
    h('div', { className: 'character-sheet' },
      h('article', { className: 'character-card' },
        h('section', { role: 'tabpanel', 'aria-label': 'Town inventory' },
          h('h3', null, 'Inventory'),
          h('article', { className: 'inventory-item' },
            h('div', null, h('strong', null, 'Health Herb'), h('div', { className: 'item-meta' }, 'common - heal - Stack ' + quantity)),
            h('p', null, 'Restores 35 HP.'),
            h('div', { className: 'inventory-actions' },
              h(StackSellControls, { item, getTotal: amount => prices.get(amount) ?? 0, onSell: (id, amount) => window.sales.push([id, amount]) })
            )
          )
        )
      )
    )
  ));
};
window.renderSale();
`;
await mkdir(output, { recursive: true });
const server = await createServer({
  root, cacheDir: `${output}/vite-cache`, server: { host: '127.0.0.1', port: 0, open: false },
  plugins: [{
    name: 'stack-sales-check',
    resolveId(id) { if (id === virtualId) return `\0${virtualId}`; },
    load(id) { if (id === `\0${virtualId}`) return entry; },
    configureServer(vite) {
      vite.middlewares.use('/__stack-sales-check', async (_request, response) => {
        response.setHeader('Content-Type', 'text/html');
        response.end(await vite.transformIndexHtml('/__stack-sales-check', `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@id/__x00__${virtualId}"></script></body></html>`));
      });
    },
  }],
});
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  assert(address && typeof address !== 'string');
  const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  browser = await chromium.launch(existsSync(chrome) ? { executablePath: chrome } : {});
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/__stack-sales-check`, { waitUntil: 'networkidle' });
  const slider = page.getByRole('slider', { name: 'Sell quantity for Health Herb' });
  await slider.focus();
  await slider.press('Home');
  await slider.press('ArrowRight');
  await slider.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Sell 3 11g', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sell One 4g', exact: true }).click();
  await page.getByRole('button', { name: 'Sell All (5) 18g', exact: true }).click();
  await page.getByRole('button', { name: 'Sell 3 11g', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.sales), [['herb', 1], ['herb', 5], ['herb', 3]]);
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 640 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    for (const quantity of [5, 12345]) {
      await page.evaluate(value => window.renderSale(value), quantity);
      await expect(slider).toHaveAttribute('max', String(quantity));
      const overflow = await page.getByRole('dialog').evaluate(dialog => [dialog, ...dialog.querySelectorAll('.inventory-item, .stack-sell-controls, button, input, label, output')].filter(element => element.getBoundingClientRect().width > 0 && element.scrollWidth > element.clientWidth + 2).map(element => element.className));
      assert.deepEqual(overflow, [], `Overflow at ${viewport.width}px, quantity ${quantity}`);
      await page.screenshot({ path: `${output}/${viewport.width}-quantity-${quantity}.png` });
    }
  }
  await page.evaluate(() => window.renderSale(5, true));
  await expect(page.getByRole('button', { name: 'Sell One', exact: true })).toBeDisabled();
  await expect(slider).toBeDisabled();
  await expect(page.getByText('Unlock before selling')).toBeVisible();
  assert.deepEqual(errors, []);
  console.log(`PASS: UI-only quote fixtures, keyboard slider, explicit quantities, disabled protection, six screenshots at 320/390/1280px; ${output}`);
} finally {
  await browser?.close();
  await server.close();
}
