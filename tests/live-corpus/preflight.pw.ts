import { test, expect } from '@playwright/test';
import type {} from './setup';

const origin = 'http://127.0.0.1:5488';
const proposed = { endpoint: 'ws://127.0.0.1:5078/api/host', provider: { provider: 'openai', model: 'gpt-6-luna',
  thinkingEffort: 'high', contextWindowTokens: 65536, maxOutputTokens: 4096 },
  limits: { maxSteps: 64, maxRefinements: 48, maxPlanContinuations: 16, timeoutSeconds: 300, actionTimeoutSeconds: 30 } };

for (const variant of ['A', 'B'] as const) test(`${variant}: actual App preflight without Start or provider traffic`, async ({ page, context }, info) => {
  const forbidden: string[] = [], errors: string[] = [], modules: string[] = [], developmentSockets: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && !url.pathname.startsWith('/api/') && route.request().method() === 'GET') {
      modules.push(url.pathname);
      return route.continue();
    }
    forbidden.push(`${route.request().method()} ${url.origin}${url.pathname}`); return route.abort();
  });
  await context.routeWebSocket('**/*', socket => {
    const url = new URL(socket.url());
    // Vite's client is needed for CSS exports. Its development socket is mocked, never connected to a server.
    if (url.origin === 'ws://127.0.0.1:5488' && url.pathname === '/') { developmentSockets.push(`${url.origin}${url.pathname}`); return; }
    forbidden.push(`WebSocket ${url.origin}${url.pathname}`); socket.close();
  });
  await page.goto('/tests/live-corpus/setup.html');
  await page.waitForFunction(() => !!window.liveCorpus);
  expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
  const genesis = await page.evaluate(variant => window.liveCorpus.initialize(variant), variant);
  expect(genesis.genesis.checkpoint.knowledge).toBeNull();
  await expect(page.getByText(/Dungeon 1 - Ready/)).toBeVisible();
  const initial = await page.evaluate(() => window.liveCorpus.snapshot());
  expect(initial).toMatchObject({ controlled: true, busy: false, recoveryRequired: false, headStatus: 'ready', launch: null });
  expect(initial.game!.quests).toEqual([]);
  expect(initial.game!.observation!.cells).toHaveLength(30);
  expect(initial.game!.observation!.cells.every(cell => cell.chests.length === 0)).toBe(true);
  const accepted = await page.evaluate(() => window.liveCorpus.accept());
  const ready = await page.evaluate(() => window.liveCorpus.snapshot());
  expect(accepted.receipts).toHaveLength(3);
  expect(accepted.position).toEqual({ level: 1, cell: { spaceId: 'entry', row: 2, column: 2 } });
  expect(accepted.first).toEqual(initial.game!.observation);
  expect(accepted.first!.cells.every(cell => ['entry', 'socket-0:passage'].includes(cell.at.cell.spaceId))).toBe(true);
  expect(ready.owner).toBe(initial.owner);
  expect(ready).toMatchObject({ controlled: true, busy: false, recoveryRequired: false, headStatus: 'ready', launch: null });
  expect(ready.game!.checkpoint.position).toEqual(accepted.position);
  expect(ready.game!.mode).toBe('manual'); expect(ready.game!.observation!.cells).toHaveLength(30);
  expect(ready.game!.observation!.cells.every(cell => cell.chests.length === 0)).toBe(true);
  expect(ready.game!.quests).toHaveLength(1);
  expect(ready.game!.quests[0]).toMatchObject({ id: accepted.target.contractId, title: 'Recover the Survey Seal', status: 'active', task: { objective: 'fetch', required: 1 } });
  const effects = await page.evaluate(target => window.liveCorpus.effects(target), accepted.target);
  expect(effects).toEqual(accepted.before); expect(effects.chest.chest.opened).toBe(false); expect(effects.questItems).toEqual([]);
  await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Agentic play', exact: true });
  await expect(dialog.getByText('gpt-6-luna', { exact: true })).toBeVisible();
  await expect(dialog.getByText('openai', { exact: true })).toBeVisible();
  await expect(dialog.getByText(proposed.endpoint, { exact: true })).toBeVisible();
  await expect(dialog.getByText('65536 context / 4096 output', { exact: true })).toBeVisible();
  await expect(dialog.getByText('64 steps / 48 refinements / 16 continuations', { exact: true })).toBeVisible();
  await expect(dialog.getByText('300 s run / 30 s action', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Start Agentic play', exact: true })).toBeDisabled();
  await dialog.getByRole('combobox', { name: 'Return quest (optional)', exact: true }).selectOption(accepted.target.contractId);
  await dialog.getByRole('textbox', { name: 'Objective', exact: true }).fill('Preflight only. Do not start.');
  await expect(dialog.getByRole('button', { name: 'Start Agentic play', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Stop Agentic play', exact: true })).toBeDisabled();
  const final = await page.evaluate(() => window.liveCorpus.snapshot());
  expect(final.canonical).toEqual(ready.canonical); expect(final.launch).toBeNull();
  expect(await page.evaluate(() => window.liveCorpus.publicAgenticProfile)).toEqual(proposed);
  expect(modules).toContain('/src/main.tsx'); expect(modules).toContain('/src/hooks/useGameSession.ts');
  expect(modules).not.toContain('/tests/e2e/canonical-start-service.fixture.ts');
  expect(forbidden).toEqual([]); expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath(`preflight-${variant}.png`) });
  await info.attach('provider-free-preflight.json', { contentType: 'application/json', body: JSON.stringify({
    source: info.config.metadata.source, trackedDelta: info.config.metadata.trackedDelta,
    variant, proposed, authorization: 'PROVIDER-FREE PREFLIGHT; NO START',
    genesis, initial, accepted, ready, effects, final, forbidden, errors, modules, developmentSockets,
  }) });
});
