import { expect, test, type Page } from '@playwright/test';
import type { LaunchJournal } from '../../src/services/agentica/launch/journal';
const service = 'http://127.0.0.1:5085';
const journal = (page: Page): Promise<LaunchJournal> => page.evaluate(() => new Promise((resolve, reject) => {
  const request = indexedDB.open('maze-agentica-launch');
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const db = request.result, read = db.transaction('journal').objectStore('journal').get('active');
    read.onsuccess = () => { resolve(read.result); db.close(); }; read.onerror = () => { reject(read.error); db.close(); };
  };
}));
const prepare = async (page: Page, provider = 'fixture') => {
  await page.goto('/?agentica=1');
  await page.getByLabel('Lab WebSocket').fill('ws://127.0.0.1:5085/api/host');
  await page.getByLabel('Provider', { exact: true }).selectOption(provider);
  await page.getByRole('button', { name: 'Prepare test save' }).click();
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'prepared', { timeout: 90000 });
};

test('opening the launcher is inert, including the default real provider', async ({ page, request }) => {
  const before = (await (await request.get(`${service}/api/runs`)).json()).length;
  let sockets = 0, realRequests = 0;
  page.on('websocket', socket => { if (new URL(socket.url()).pathname === '/api/host') sockets++; });
  await page.route('http://127.0.0.1:5078/**', route => { realRequests++; return route.abort(); });
  await page.goto('/?agentica=1');
  await expect(page.getByRole('button', { name: 'Start live test' })).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel('Provider', { exact: true })).toHaveValue('openai');
  expect(sockets).toBe(0); expect(realRequests).toBe(0);
  expect((await (await request.get(`${service}/api/runs`)).json()).length).toBe(before);
});

test('visible three-room journey reloads inertly, requires adoption, and completes one semantic wake', async ({ page, request }, info) => {
  await prepare(page);
  await page.getByRole('button', { name: 'Room', exact: true }).click();
  await expect(page.getByRole('img')).toHaveCount(0);
  const canvas = page.locator('canvas'); await expect(canvas).toBeVisible();
  expect(await canvas.evaluate((node: HTMLCanvasElement) => new Set(node.getContext('2d')!.getImageData(0, 0, node.width, node.height).data).size)).toBeGreaterThan(30);
  await page.screenshot({ path: info.outputPath('desktop.png') });
  const before = Number(await page.locator('main').getAttribute('data-moves'));
  await page.getByRole('button', { name: 'Start fixture' }).click();
  await expect.poll(async () => Number(await page.locator('main').getAttribute('data-moves')), { timeout: 30000 }).toBeGreaterThan(before + 1);
  const original = await journal(page);
  await page.reload();
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'recovery-required');
  const retainedMoves = await page.locator('main').getAttribute('data-moves');
  await page.waitForTimeout(750);
  expect(await page.locator('main').getAttribute('data-moves')).toBe(retainedMoves);
  await page.getByRole('button', { name: 'Recover', exact: true }).click();
  await expect(page.getByLabel('Execution status')).toHaveText('awaiting-adoption', { timeout: 15000 });
  expect(await page.locator('main').getAttribute('data-moves')).toBe(retainedMoves);
  await page.getByRole('button', { name: 'Adopt', exact: true }).click();
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'completed', { timeout: 60000 });
  const final = await journal(page);
  expect(final.originalRunId).toBe(original.originalRunId); expect(final.runId).not.toBe(original.runId);
  const evidence = await (await request.get('http://127.0.0.1:5086/evidence')).json();
  const run = await (await request.get(`${service}/api/runs/${original.originalRunId}`)).json();
  const calls = evidence.filter((entry: any) => entry.scope === run.scopeId);
  expect(calls.filter((entry: any) => entry.tool === 'maze.navigate')).toHaveLength(1);
  expect(calls.filter((entry: any) => entry.tool === 'maze.inspect')).toHaveLength(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Room', exact: true }).click();
  await expect(canvas).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('mobile-room.png') });
  await page.getByRole('button', { name: 'Events', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Lab run' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('mobile-events.png') });
});

test('Stop fences local travel and duplicate tabs cannot replace an active launch', async ({ page, context }) => {
  await prepare(page);
  const before = Number(await page.locator('main').getAttribute('data-moves'));
  await page.getByRole('button', { name: 'Start fixture' }).click();
  await expect.poll(async () => Number(await page.locator('main').getAttribute('data-moves')), { timeout: 30000 }).toBeGreaterThan(before);
  const other = await context.newPage(); await other.goto('/?agentica=1');
  await other.getByRole('button', { name: 'Recover', exact: true }).click();
  await expect(other.getByRole('alert')).toContainText('Another launch tab');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByLabel('Execution status')).toHaveText('cancelled', { timeout: 15000 });
  const stopped = await page.locator('main').getAttribute('data-moves');
  await page.waitForTimeout(750);
  expect(await page.locator('main').getAttribute('data-moves')).toBe(stopped);
});

test('missing credential fails before any start or paid request', async ({ page }) => {
  await page.route('**/api/providers/openai/settings', route => route.fulfill({ json: { configured: false } }));
  await prepare(page, 'openai');
  let sockets = 0; page.on('websocket', socket => { if (new URL(socket.url()).pathname === '/api/host') sockets++; });
  await page.getByRole('button', { name: 'Start live test' }).click();
  await expect(page.getByRole('alert')).toContainText('Configure the OpenAI credential in Lab');
  expect(sockets).toBe(0);
  expect((await journal(page)).runId).toBeUndefined();
});

test('setup failure after admission announcement is visible and never automatically retried', async ({ page }) => {
  let starts = 0;
  await page.route('**/api/providers/openai/settings', route => route.fulfill({ json: { configured: true } }));
  await page.routeWebSocket('**/api/host', ws => ws.onMessage(raw => {
    const message = JSON.parse(String(raw));
    if (message.type !== 'start') return;
    starts++;
    expect(message.payload.provider).toEqual({ provider: 'openai', model: 'gpt-6-luna', thinkingEffort: 'high',
      contextWindowTokens: 131072, maxOutputTokens: 4096, includeThoughtSummaries: false });
    expect(message.payload.limits).toMatchObject({ maxSteps: 8, maxRefinements: 2, maxPlanContinuations: 2 });
    const { hostId, sessionId, sessionEpoch, scopeId, perspectiveId, objectiveId } = message.payload;
    ws.send(JSON.stringify({ protocolVersion: 1, type: 'started', requestId: message.requestId, runId: 'failed-run',
      payload: { runId: 'failed-run', hostId, sessionId, sessionEpoch, scopeId, perspectiveId, objectiveId, manifestHash: `sha256:${'a'.repeat(64)}` } }));
    ws.send(JSON.stringify({ protocolVersion: 1, type: 'run.terminated', runId: 'failed-run',
      payload: { status: 'failed', code: 'run.failed', message: 'Fixture setup failure' } }));
  }));
  await prepare(page, 'openai');
  await page.getByRole('button', { name: 'Start live test' }).click();
  await expect(page.getByLabel('Execution status')).toHaveText('failed', { timeout: 15000 });
  await page.getByRole('button', { name: 'Events', exact: true }).click();
  await expect(page.getByText('run.failed: Fixture setup failure', { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('button', { name: 'Start live test' })).toBeDisabled();
  expect(starts).toBe(1);
});

test('Stop during live readiness cannot dispatch a delayed paid start', async ({ page }) => {
  let release!: () => void, waiting = false, starts = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/providers/openai/settings', async route => { waiting = true; await gate; await route.fulfill({ json: { configured: true } }); });
  await page.routeWebSocket('**/api/host', ws => ws.onMessage(raw => { if (JSON.parse(String(raw)).type === 'start') starts++; }));
  await prepare(page, 'openai');
  await page.getByRole('button', { name: 'Start live test' }).click();
  await expect.poll(() => waiting).toBe(true);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  release();
  await expect(page.getByRole('button', { name: 'Start live test' })).toBeEnabled();
  expect(starts).toBe(0); expect((await journal(page)).runId).toBeUndefined();
});
