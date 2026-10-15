import { test, expect } from '@playwright/test';
import type {} from './canonical-publication-selection.fixture';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5242' ? route.continue() : route.abort());
  await page.goto('/tests/e2e/canonical-publication-selection.html');
  await page.waitForFunction(() => !!window.publicationSelection);
});

for (const changed of [false, true]) test(`R2 permits new frozen binding after ${changed ? 'real settings change' : 'execution-only bookkeeping'}`, async ({ page }) => {
  const r = await page.evaluate(async changed => {
    const c = window.publicationSelection, first = await c.boot(), before = (await c.head()).head;
    if (changed) await c.changeWorld();
    const beforePublish = (await c.head()).head, publication = await c.publish(), second = await c.renew(publication);
    const after = (await c.head()).head, binding = { grant: first.binding.grant, publication };
    const action = await c.action(binding); await c.reserve(binding, action); const result = await c.effect(binding, action);
    c.stop(); return { before, beforePublish, after, first, second, result };
  }, changed);
  expect(r.after.roots.world).toBe(r.beforePublish.roots.world);
  expect(r.after.roots.knowledge).toBe(r.before.roots.knowledge); expect(r.after.checkpoint).toEqual(r.beforePublish.checkpoint);
  expect(r.after.roots.world === r.before.roots.world).toBe(!changed);
  expect(r.second.value.data.previousSelection).toEqual(r.first.selection!.ref);
  expect(r.result.disposition).toBe('applied'); expect(r.result.beforeRevision).toBe(r.beforePublish.revision);
  expect(r.after.revision).toBeGreaterThan(r.before.revision);
});

for (const pending of [false, true]) test(`R1 ${pending ? 'pending effect' : 'fresh reservation'} is fenced after same-world R2`, async ({ page }) => {
  const r = await page.evaluate(async pending => {
    const c = window.publicationSelection, first = await c.boot(), action = await c.action(first.binding);
    if (pending) await c.reserve(first.binding, action);
    const publication = await c.publish(); await c.renew(publication);
    const before = await c.dump();
    const error = await (pending ? c.effect(first.binding, action) : c.reserve(first.binding, action)).then(() => 'accepted', String);
    const unchanged = before === await c.dump(); c.stop(); return { error, unchanged };
  }, pending);
  expect(r.error).toContain('not selected'); expect(r.unchanged).toBe(true);
});

test('R1 completed action stays exactly reconcilable after renewal and reload without a writer', async ({ page }) => {
  const original = await page.evaluate(async () => {
    const c = window.publicationSelection, first = await c.boot(), action = await c.action(first.binding);
    await c.reserve(first.binding, action); const result = await c.effect(first.binding, action);
    const publication = await c.publish(); await c.renew(publication);
    c.stop(); return { action, result, binding: { ...first.binding, publication } };
  });
  await page.reload(); await page.waitForFunction(() => !!window.publicationSelection);
  const r = await page.evaluate(async original => {
    const c = window.publicationSelection, before = await c.dump(), replay = await c.replayWithoutWriter(original.binding, original.action);
    return { replay, unchanged: before === await c.dump() };
  }, original);
  expect(r.replay.writes).toEqual([]); expect(r.unchanged).toBe(true);
  expect(r.replay.loaded?.result).toEqual(original.result);
  expect(r.replay.reconciled).toEqual(original.result); expect(r.replay.effect).toEqual(original.result);
});
