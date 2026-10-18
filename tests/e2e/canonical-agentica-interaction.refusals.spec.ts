import { test, expect, evidence } from './canonical-agentica-interaction.test';

test('a disclosed token without this lifetime reservation cannot admit or execute', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalAgenticaInteraction; await f.boot();
    const selected = await f.selectChest(), original = await f.action('maze.interact', { target: selected.target });
    const before = await f.dump(), effects = await f.effects(), result = await f.perform(original), identity = await f.identityAndProof(original);
    return { original, selected, before, after: await f.dump(), effects, afterEffects: await f.effects(), result,
      retained: await f.retained(original), child: await f.live(identity.operationId) };
  });
  expect(r.result.disposition).toBe('unresolved'); expect(r.result.operation).toBeUndefined();
  expect(r.retained.value).toBeNull(); expect(r.child).toBeUndefined(); expect(r.after).toBe(r.before); expect(r.afterEffects).toEqual(r.effects);
  await evidence(info, 'absent-reservation.json', r);
});

test('a genuine inspected token with an absent grant cannot reserve or admit', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalAgenticaInteraction, boot = await f.boot(), selected = await f.selectChest();
    const original = await f.action('maze.interact', { target: selected.target });
    const absent = { ...boot.binding, grant: { key: 'agentica/run-grants/missing', id: crypto.randomUUID() } };
    const before = await f.dump(), effects = await f.effects(), refusal = await f.refusal(() => f.reserveWithBinding(original, absent));
    const identity = await f.identityAndProof(original);
    return { selected, original, absent, before, after: await f.dump(), refusal, effects, afterEffects: await f.effects(),
      retained: await f.retained(original), child: await f.live(identity.operationId) };
  });
  expect(r.refusal.rejected).toBe(true); expect(r.after).toBe(r.before); expect(r.afterEffects).toEqual(r.effects);
  expect(r.retained.value).toBeNull(); expect(r.child).toBeUndefined();
  await evidence(info, 'absent-grant.json', r);
});

for (const field of ['publication', 'source'] as const) test(`foreign token ${field} produces only an explicit refusal`, async ({ page }, info) => {
  const r = await page.evaluate(async field => {
    const f = window.canonicalAgenticaInteraction; await f.boot(); const selected = await f.selectChest();
    const token = JSON.parse(selected.target); token[field].id = crypto.randomUUID();
    const original = await f.action('maze.interact', { target: JSON.stringify(token) }), before = await f.effects();
    const result = await f.dispatch(original), identity = await f.identityAndProof(original);
    return { selected, original, before, after: await f.effects(), result, identity, child: await f.live(identity.operationId),
      retained: await f.retained(original) };
  }, field);
  expect(r.result.disposition).toBe('refused'); expect(r.result.operation).toBeUndefined(); expect(r.after).toEqual(r.before);
  expect(r.child).toBeUndefined(); expect(r.identity.proof!.value).toMatchObject({ proof: 'standalone' });
  expect(r.retained.value!.result).toEqual(r.result);
  await evidence(info, `foreign-${field}-token.json`, r);
});

test('a newly committed same-owner sight invalidates the reserved original token before admission', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalAgenticaInteraction; await f.boot(); const selected = await f.selectChest();
    const original = await f.action('maze.interact', { target: selected.target }); await f.reserve(original);
    const beforeLook = await f.effects(); await f.look(); const afterLook = await f.effects(), before = await f.dump();
    const refusal = await f.refusal(() => f.perform(original)), identity = await f.identityAndProof(original);
    return { selected, original, beforeLook, afterLook, before, after: await f.dump(), refusal,
      afterEffects: await f.effects(), retained: await f.retained(original), child: await f.live(identity.operationId) };
  });
  expect(r.afterLook.observation.header.sequence).toBe(r.beforeLook.observation.header.sequence + 1);
  expect(r.refusal.rejected).toBe(true); expect(r.refusal.message).toContain('publication');
  expect(r.after).toBe(r.before); expect(r.afterEffects).toEqual(r.afterLook);
  expect(r.retained.value!.result).toBeNull(); expect(r.child).toBeUndefined();
  await evidence(info, 'stale-original-sight.json', r);
});
