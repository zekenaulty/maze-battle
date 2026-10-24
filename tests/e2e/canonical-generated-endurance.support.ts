import { expect, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { move, ready, state, type Sample } from './canonical-revisit.support';
import type * as fixture from './canonical-generated-endurance.fixture';
import type { Direction } from '../../src/domain/types';

export { move, ready, state };
export const audit = (page: Page) => page.evaluate(async () =>
  (await import('../../tests/e2e/canonical-generated-endurance.fixture')).audit());
export const diagnostic = (page: Page) => page.evaluate(async () =>
  (await import('../../tests/e2e/canonical-generated-endurance.fixture')).diagnostic());
const directions: Record<string, Direction> = { ArrowUp: 'north', ArrowRight: 'east', ArrowDown: 'south', ArrowLeft: 'west' };

export async function isolated(context: BrowserContext, page: Page, seed: number) {
  const unexpected: string[] = [], errors: string[] = [];
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === 'http://127.0.0.1:5474') return route.continue();
    unexpected.push(route.request().url()); return route.abort();
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('websocket', socket => { if (!socket.url().startsWith('ws://127.0.0.1:5474/')) unexpected.push(socket.url()); });
  await page.route('**/endurance-setup', route => route.fulfill({ contentType: 'text/html', body: '<title>Generated fixture setup, App unmounted</title>' }));
  await page.goto('/endurance-setup');
  const birth = await page.evaluate(async seed => (await import('../../tests/e2e/canonical-generated-endurance.fixture')).initialize(seed), seed);
  expect(birth.limits).toEqual({ reads: 2048, writes: 512, bytes: 4 * 1024 * 1024 });
  expect(birth.quota).toEqual({ limitBytes: 256 * 1024 * 1024, reserveBytes: 8 * 1024 * 1024 });
  await page.goto('/'); await ready(page);
  return { birth, unexpected, errors };
}

export async function retain(page: Page, depth: number) {
  await page.goto('/endurance-setup');
  const setup = await page.evaluate(async depth =>
    (await import('../../tests/e2e/canonical-app-depth.fixture')).retainFloors(depth), depth);
  expect(setup.floors).toBe(depth);
  const route = setup.keys.map(key => directions[key]);
  if (route.length !== 2 || route.some(direction => !direction)) throw Error('Invalid observed reciprocal fixture edge');
  await page.goto('/'); await ready(page);
  for (const direction of route) await move(page, direction);
  return { ...setup, route };
}

export async function sample(page: Page, key: string, info: TestInfo, label: string) {
  const before = await state(page);
  await page.evaluate(async () => (await import('../../tests/e2e/canonical-revisit.probe')).startProbe());
  let native: Sample;
  try {
    await page.keyboard.press(key);
    await expect.poll(async () => (await state(page)).checkpoint.position).not.toEqual(before.checkpoint.position);
    await ready(page);
  } finally {
    native = await page.evaluate(async () => (await import('../../tests/e2e/canonical-revisit.probe')).finishProbe());
    await attach(info, `${label}-native.json`, native);
  }
  expect(native.forbidden).toEqual([]);
  expect(native.native.operations.every(o => o.status === 'success')).toBe(true);
  expect(native.native.transactions.every(t => t.outcome === 'complete')).toBe(true);
  expect(native.native.operations.filter(o => ['getAll', 'getAllKeys', 'delete', 'clear'].includes(o.method))).toEqual([]);
  const after = await state(page);
  expect(after.checkpoint.knowledge!.sequence).toBe(before.checkpoint.knowledge!.sequence + 1);
  const work = await diagnostic(page);
  expect(work.stats.reads).toBeLessThanOrEqual(2048);
  expect(work.stats.writes).toBeLessThanOrEqual(512);
  expect(work.stats.readBytes + work.stats.writeBytes).toBeLessThanOrEqual(4 * 1024 * 1024);
  return { native, work };
}

export function local(sample: Sample) {
  expect(sample.readKeys.filter(k => /^dungeon\/(?!1(?:\/|$))\d/.test(k))).toEqual([]);
  expect(sample.writeKeys.filter(k => k.startsWith('dungeon/'))).toEqual([]);
  expect(sample.reads).toBeLessThan(2500); expect(sample.writes).toBeLessThan(150);
  expect(sample.readBytes).toBeLessThan(1_000_000); expect(sample.writeBytes).toBeLessThan(180_000);
}

export function comparable(first: Sample, later: Sample) {
  expect(later.reads).toBeLessThan(first.reads + 100);
  expect(later.readBytes).toBeLessThan(first.readBytes + 160_000);
  expect(later.writeBytes).toBeLessThan(first.writeBytes + 20_000);
}

export async function witness(page: Page, direction: Direction) {
  const receipt = await move(page, direction);
  return page.evaluate(async wire =>
    (await import('../../tests/e2e/canonical-generated-endurance.fixture')).sourceWitness(JSON.parse(wire)), JSON.stringify(receipt));
}

export async function retained(page: Page, old: Awaited<ReturnType<typeof fixture.sourceWitness>>) {
  const result = await page.evaluate(async wire =>
    (await import('../../tests/e2e/canonical-generated-endurance.fixture')).verifyRetained(JSON.parse(wire)), JSON.stringify(old));
  expect(result.observation).toEqual(old.observation); expect(result.receipt).toEqual(old.receipt);
  expect(result.replay.replayed).toBe(true); expect(result.replay.receipt).toEqual(old.receipt);
  expect(result.replay.stats.writes).toBe(0); expect(result.replay.stats.writeBytes).toBe(0);
  expect(result.after.head).toEqual(result.before.head);
  for (const key of ['records', 'nodes', 'receipts'] as const) expect(result.after[key]).toBe(result.before[key]);
  return result;
}

export const attach = (info: TestInfo, name: string, value: unknown) => info.attach(name,
  { body: JSON.stringify(value, null, 2), contentType: 'application/json' });
