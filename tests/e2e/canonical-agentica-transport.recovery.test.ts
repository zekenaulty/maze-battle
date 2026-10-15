import { test as base, expect, type Page, type WebSocketRoute } from '@playwright/test';
import type {} from './canonical-agentica-transport.fixture';
import type { AgenticaStart } from '../../src/services/agentica/contracts';
import { launchEntryFixture, type LaunchEntryFixture } from '../../src/persistence/canonical/agentica/launch.test-support';
import { durableSubmission } from './canonical-agentica-transport.wire';

export { expect } from '@playwright/test';
export const origin = 'http://127.0.0.1:5244';
export interface DurableServer {
  socket?: WebSocketRoute;
  starts: { attemptId: string; request: AgenticaStart }[];
  gets: string[]; posts: unknown[]; forbidden: string[];
  entry: LaunchEntryFixture | null; stopReply?: unknown; failStop: boolean;
  requireLocalStop: boolean; manifestHash: string;
}
export const test = base.extend<{ durableServer: DurableServer }>({ durableServer: [async ({ page, context }, use) => {
  const server: DurableServer = { starts: [], gets: [], posts: [], forbidden: [], entry: null, failStop: false, requireLocalStop: false, manifestHash: '' };
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { server.forbidden.push(url.href); return route.abort(); }
    if (url.pathname === '/@vite/client') return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname !== '/api/starts' && url.pathname !== '/api/starts/stop') {
      server.forbidden.push(url.href); return route.abort();
    }
    if (server.requireLocalStop)
      expect((await page.evaluate(() => window.canonicalTransport.launch()))!.guard.terminal?.disposition).toBe('cancelled');
    const submitted = server.starts[0];
    if (!submitted) { server.forbidden.push(url.href); return route.abort(); }
    const key = { hostId: submitted.request.hostId, sessionId: submitted.request.sessionId, attemptId: submitted.attemptId };
    if (url.pathname === '/api/starts') {
      expect(route.request().method()).toBe('GET');
      expect([...url.searchParams.keys()].sort()).toEqual(Object.keys(key).sort());
      expect(Object.fromEntries(url.searchParams)).toEqual(key); server.gets.push(url.href);
      return server.entry === null ? route.fulfill({ status: 404, json: { code: 'start.not_found', message: 'UNKNOWN' } })
        : route.fulfill({ json: server.entry });
    }
    expect(route.request().method()).toBe('POST'); expect(url.search).toBe('');
    const body = route.request().postDataJSON(); server.posts.push(body);
    expect(body).toEqual({ ...key, runId: server.entry!.runId, acceptedRequestHash: server.entry!.acceptedRequestHash });
    server.entry = { ...server.entry!, stopRequested: true };
    if (server.failStop) return route.abort();
    return route.fulfill({ json: server.stopReply ?? server.entry });
  });
  await context.routeWebSocket('**/*', socket => {
    if (socket.url() !== 'ws://127.0.0.1:5244/api/host') { server.forbidden.push(socket.url()); socket.close(); return; }
    server.socket = socket;
    socket.onMessage(text => server.starts.push(durableSubmission(JSON.parse(String(text)))));
  });
  await page.goto('/tests/e2e/canonical-agentica-transport.html');
  await page.waitForFunction(() => !!window.canonicalTransport);
  try { await use(server); }
  finally {
    await page.evaluate(() => window.canonicalTransport.stop());
    expect(server.forbidden, 'No /runs fallback, providers, or external origins').toEqual([]);
  }
}, { auto: true }] });

export async function loseStart(page: Page, server: DurableServer) {
  const boot = await page.evaluate(async () => {
    const b = await window.canonicalTransport.boot(); await window.canonicalTransport.attach(); window.canonicalTransport.begin(); return b;
  });
  await expect.poll(() => server.starts.length).toBe(1);
  const dispatch = (await page.evaluate(() => window.canonicalTransport.launch()))!.dispatch!;
  expect(server.starts[0]).toEqual({ attemptId: dispatch.source.attemptId, request: boot.start });
  server.manifestHash = await page.evaluate(() => window.canonicalTransport.expectedManifest());
  server.socket!.close(); await page.waitForFunction(() => window.canonicalTransport.status().status === 'failed');
  return boot;
}
export function original(server: DurableServer) {
  const { request, attemptId } = server.starts[0];
  return launchEntryFixture(request, attemptId, 'original-run', server.manifestHash);
}
export async function reload(page: Page) {
  await page.reload(); await page.waitForFunction(() => !!window.canonicalTransport);
  await page.evaluate(() => window.canonicalTransport.reloadSession());
}
export function recover(page: Page, mode: 'inspect' | 'stop') {
  return page.evaluate(async m => {
    try { return await window.canonicalTransport.recover(m); } catch (error) { return { error: String(error) }; }
  }, mode);
}
export async function holdLookup(page: Page, server: DurableServer) {
  let release!: () => void, entered = false;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`${origin}/api/starts?*`, async route => {
    entered = true; await held; await route.fulfill({ json: server.entry });
  });
  return { release, entered: () => entered };
}
