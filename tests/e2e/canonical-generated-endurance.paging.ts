import { expect, type Page, type TestInfo } from '@playwright/test';
import type { CanonicalSnapshot } from '../../src/persistence/canonical/types';
import type { rooms, connections } from './canonical-generated-endurance.recall';
import type { MeteredPage, connectionPage } from './canonical-generated-endurance.paging.fixture';
import { attach, state, comparable } from './canonical-generated-endurance.support';

type Query = Awaited<ReturnType<typeof rooms>> | Awaited<ReturnType<typeof connections>>;

function checked<T extends Query>(sample: MeteredPage<T>, snapshot: CanonicalSnapshot) {
  expect(sample.error).toBeNull();
  if (!sample.result || sample.payloadBytes === null) throw Error('Missing measured public page');
  const { result, native, payloadBytes } = sample;
  expect(result.snapshot).toEqual(snapshot);
  expect(result.value.anchor).toEqual(snapshot.checkpoint.knowledge);
  expect(payloadBytes).toBeLessThanOrEqual(4096);
  expect(result.stats.reads).toBeLessThanOrEqual(2048);
  expect(result.stats.readBytes).toBeLessThanOrEqual(4 * 1024 * 1024);
  expect(result.stats.writes).toBe(0); expect(result.stats.writeBytes).toBe(0);
  // The mounted App's normal refresh can overlap a page read. Retain and bound it, never subtract it from reported work.
  const meta = native.native.operations.filter(op => op.store === 'meta');
  const heads = native.native.operations.filter(op => op.store === 'heads');
  expect(meta.length).toBeGreaterThan(0); expect(heads).toHaveLength(meta.length);
  const refreshBytes = [...meta.slice(1), ...heads.slice(1)].reduce((sum, op) => sum + op.logicalBytes, 0);
  expect(native.reads).toBe(result.stats.reads + 2 * (meta.length - 1));
  expect(native.readBytes).toBe(result.stats.readBytes + refreshBytes);
  expect(native.reads).toBeLessThanOrEqual(2048); expect(native.readBytes).toBeLessThanOrEqual(4 * 1024 * 1024);
  expect(native.writes).toBe(0); expect(native.writeBytes).toBe(0); expect(native.writeKeys).toEqual([]);
  expect(native.forbidden).toEqual([]);
  expect(native.readKeys.filter(key => key.startsWith('dungeon/'))).toEqual([]);
  expect(native.native.operations.every(op => op.method === 'get' && op.status === 'success')).toBe(true);
  expect(native.native.transactions.every(tx => tx.mode === 'readonly' && tx.outcome === 'complete')).toBe(true);
  return result;
}

export async function pagedRecall(page: Page, info: TestInfo, label: string, selected?: string) {
  const before = await state(page);
  const first = await page.evaluate(async () =>
    (await import('../../tests/e2e/canonical-generated-endurance.paging.fixture')).roomPage());
  await attach(info, `${label}-rooms-1.json`, first);
  const a = checked(first, before.snapshot);
  expect(a.value.items).toHaveLength(2);
  if (!a.value.next) throw Error('Retained-depth earned scope cannot provide a second room page');
  const second = await page.evaluate(async cursor =>
    (await import('../../tests/e2e/canonical-generated-endurance.paging.fixture')).roomPage(cursor), a.value.next);
  await attach(info, `${label}-rooms-2.json`, second);
  const b = checked(second, before.snapshot), nodes = [...a.value.items, ...b.value.items];
  expect(b.value.items).toHaveLength(2);
  expect(nodes.every(node => node.kind === 'room' && node.level === before.checkpoint.position.level)).toBe(true);
  expect(new Set(nodes.map(node => node.spaceId)).size).toBe(nodes.length);
  if (selected) expect(nodes.map(node => node.spaceId)).toContain(selected);
  const attempts: { spaceId: string; sample: Awaited<ReturnType<typeof connectionPage>> }[] = [];
  for (const node of nodes.filter(node => selected === undefined || node.spaceId === selected)) {
    const sample = await page.evaluate(async id =>
      (await import('../../tests/e2e/canonical-generated-endurance.paging.fixture')).connectionPage(id), node.spaceId);
    attempts.push({ spaceId: node.spaceId, sample });
    await attach(info, `${label}-connections-${attempts.length}-1.json`, sample);
    const found = checked(sample, before.snapshot);
    expect(found.value.from).toEqual(node);
    if (!found.value.next) continue;
    const next = await page.evaluate(async ({ id, cursor }) =>
      (await import('../../tests/e2e/canonical-generated-endurance.paging.fixture')).connectionPage(id, cursor),
    { id: node.spaceId, cursor: found.value.next });
    await attach(info, `${label}-connections-${attempts.length}-2.json`, next);
    const continued = checked(next, before.snapshot);
    expect(continued.value.from).toEqual(node);
    expect(found.value.items).toHaveLength(1); expect(continued.value.items).toHaveLength(1);
    expect(continued.value.items[0].room.spaceId).not.toBe(found.value.items[0].room.spaceId);
    expect(await state(page)).toEqual(before);
    expect(continued.head).toEqual(a.head); expect(found.head).toEqual(a.head); expect(b.head).toEqual(a.head);
    return { requestWidths: { rooms: 2, connections: 1 }, selected: node.spaceId,
      rooms: [first, second], connections: [sample, next], attempts };
  }
  throw Error('First two earned room pages cannot provide two connection pages within the four-room selection bound');
}

export function comparablePages(first: Awaited<ReturnType<typeof pagedRecall>>, later: typeof first) {
  expect(later.selected).toBe(first.selected);
  for (const kind of ['rooms', 'connections'] as const) {
    expect(first[kind]).toHaveLength(2); expect(later[kind]).toHaveLength(2);
    for (let index = 0; index < 2; index++) comparable(first[kind][index].native, later[kind][index].native);
  }
}
