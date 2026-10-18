// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import config from '../e2e/canonical-start-service.vite';

const registration = vi.hoisted(() => ({ extend: vi.fn(), use: vi.fn() }));
vi.mock('@playwright/test', async () => ({ expect: (await import('vitest')).expect,
  test: { extend: registration.extend.mockImplementation(() => Object.assign(vi.fn(), { use: registration.use })) } }));
vi.mock('./service.mjs', () => ({ serviceOrigin: 'http://127.0.0.1:5259',
  ServiceProcess: class { start() { throw Error('No services in boot regression'); } } }));

afterEach(() => { vi.unstubAllGlobals(); });

it.each([false, true])('sets roomProof=%s before the auto fixture creates its retained game', async roomProof => {
  await import('../e2e/canonical-start-service.decision.test');
  const fixtures = registration.extend.mock.calls[0][0];
  expect(fixtures.roomProof).toEqual([false, { option: true }]);
  // Execute the real fixture and Vite seed transform, with browser/service IO replaced by in-memory doubles.
  const plugin = (config.plugins as { name?: string; transform?: (source: string, id: string) => string }[])
    .find(plugin => plugin.name === 'actual-app-service-controller')!;
  const transformed = plugin.transform!('const seed = crypto.getRandomValues(new Uint32Array(1))[0]; return seed;',
    '/src/persistence/canonical/game/initialize.ts');
  const initialize = new Function('location', transformed) as (location: { href: string }) => number;
  const calls: string[] = [], origin = 'http://127.0.0.1:5258';
  let href = origin, retainedSeed: number | undefined;
  const api = { boot: async () => { calls.push('boot'); retainedSeed ??= initialize({ href }); },
    readDecision: async () => null, stop: () => {} };
  vi.stubGlobal('window', { canonicalStartService: api });
  const fetch = vi.fn(async (url: string) => {
    expect(url).toBe('http://127.0.0.1:5259/fixture/proof');
    return { ok: true, json: async () => ({ fixture: 'offline-double' }) };
  });
  vi.stubGlobal('fetch', fetch);
  const page = { on: vi.fn(), goto: async (path: string) => { calls.push(path); href = origin + path; },
    waitForFunction: async (fn: () => boolean) => { expect(fn()).toBe(true); calls.push('ready'); },
    evaluate: async (fn: () => unknown) => fn() };
  await fixtures.wire[0]({ page, context: { route: vi.fn() }, roomProof }, async () => {
    expect(calls).toEqual(['/tests/e2e/canonical-start-service.html' + (roomProof ? '?roomProof=1' : ''), 'ready', 'boot']);
    expect(retainedSeed).toBe(roomProof ? 5 : 2);
    await page.goto('/?roomProof=1'); await api.boot();
    expect(retainedSeed).toBe(roomProof ? 5 : 2); // A later URL flag never resets an existing game.
  }, { attach: vi.fn() });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('opts the actual App room case into the pre-boot flag', async () => {
  await import('../e2e/canonical-start-service.app-room.spec');
  expect(registration.use).toHaveBeenCalledWith({ roomProof: true });
});
